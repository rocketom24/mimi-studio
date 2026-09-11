import { WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "../config/world";
import { polygonOverlapsAabb, type Point } from "../world/collisionShapes";
import type { PixelRect } from "../types/world";

/**
 * Click-to-navigate pathfinding: a coarse static walkability grid + 8-way A*
 * + line-of-sight string-pulling. Pure math, no Phaser — same reasoning as
 * collisionShapes.ts (callers pass in the solid rects/polygons/body size
 * instead of this module reaching into Player.ts or collision.ts itself).
 */

const CELL_SIZE = 8;

export interface PathGrid {
  readonly cols: number;
  readonly rows: number;
  readonly blocked: Uint8Array;
}

function index(grid: PathGrid, cx: number, cy: number): number {
  return cy * grid.cols + cx;
}

function inBounds(grid: PathGrid, cx: number, cy: number): boolean {
  return cx >= 0 && cy >= 0 && cx < grid.cols && cy < grid.rows;
}

function isBlocked(grid: PathGrid, cx: number, cy: number): boolean {
  return !inBounds(grid, cx, cy) || grid.blocked[index(grid, cx, cy)] === 1;
}

function cellCenter(cx: number, cy: number): Point {
  return { x: cx * CELL_SIZE + CELL_SIZE / 2, y: cy * CELL_SIZE + CELL_SIZE / 2 };
}

function worldToCell(x: number, y: number): { cx: number; cy: number } {
  return { cx: Math.floor(x / CELL_SIZE), cy: Math.floor(y / CELL_SIZE) };
}

/**
 * Builds the static walkability grid once at scene boot: a cell is blocked
 * if Mimi's own square body, centred there, would overlap a wall/solid-room-
 * furniture rect or an editor-placed furniture footprint. Same inflated-AABB
 * test her live collision already runs (resolveFurnitureCollision /
 * polygonOverlapsAabb), so the grid can never disagree with what actually
 * stops her. Editor-placed furniture is read once here — fine, since editing
 * it live is a dev-only mode that already freezes Mimi (furnitureEditingActive).
 *
 * `rects` is every wall/solid-room-furniture rect (StudioScene passes
 * staticSolidRects() from collision.ts — the exact same rects the real
 * Arcade collider spawns from), `furniturePolygons` is
 * furnitureEditor.footprintPolygons(), and `bodyHalfWidth` is half of
 * Player's BODY_FOOTPRINT_PX. Passed in rather than imported so this module
 * stays pure/Phaser-free, same as collisionShapes.ts.
 */
export function buildPathGrid(rects: readonly PixelRect[], furniturePolygons: readonly Point[][], bodyHalfWidth: number): PathGrid {
  const cols = Math.ceil(WORLD_PIXEL_WIDTH / CELL_SIZE);
  const rows = Math.ceil(WORLD_PIXEL_HEIGHT / CELL_SIZE);
  const blocked = new Uint8Array(cols * rows);
  const half = CELL_SIZE / 2 + bodyHalfWidth;

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cellCenter(cx, cy);
      let hit = rects.some((rect) => {
        const rectHalfW = rect.w / 2;
        const rectHalfH = rect.h / 2;
        const rectCx = rect.x + rectHalfW;
        const rectCy = rect.y + rectHalfH;
        return Math.abs(c.x - rectCx) < half + rectHalfW && Math.abs(c.y - rectCy) < half + rectHalfH;
      });
      if (!hit) {
        hit = furniturePolygons.some((polygon) => polygon.length >= 3 && polygonOverlapsAabb(polygon, c.x, c.y, half, half));
      }
      blocked[cy * cols + cx] = hit ? 1 : 0;
    }
  }
  return { cols, rows, blocked };
}

/** Nearest walkable cell to (cx, cy) within a small search radius, or the cell itself if already clear — safety net for a start/goal that lands exactly on a blocked cell (floating-point edge, or a click a px inside a footprint). */
function nearestOpenCell(grid: PathGrid, cx: number, cy: number, maxRadius = 4): { cx: number; cy: number } | null {
  if (!isBlocked(grid, cx, cy)) return { cx, cy };
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!isBlocked(grid, cx + dx, cy + dy)) return { cx: cx + dx, cy: cy + dy };
      }
    }
  }
  return null;
}

const SQRT2 = Math.SQRT2;

/** Octile distance — admissible heuristic for 8-directional movement with diagonal cost SQRT2. */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}

const NEIGHBORS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/**
 * 8-directional A* over the grid. Linear-scan open set (no binary heap) —
 * fine at this grid's size (a few thousand cells), called once per click.
 * Diagonal moves that would clip a wall corner are rejected by requiring
 * both orthogonal-adjacent cells to be open too.
 */
function findGridPath(grid: PathGrid, start: { cx: number; cy: number }, goal: { cx: number; cy: number }): { cx: number; cy: number }[] | null {
  if (start.cx === goal.cx && start.cy === goal.cy) return [start];

  const startIdx = index(grid, start.cx, start.cy);
  const goalIdx = index(grid, goal.cx, goal.cy);
  const g = new Map<number, number>([[startIdx, 0]]);
  const parent = new Map<number, number>();
  const open = new Set<number>([startIdx]);
  const closed = new Set<number>();

  while (open.size > 0) {
    let currentIdx = -1;
    let bestF = Infinity;
    for (const idx of open) {
      const cx = idx % grid.cols;
      const cy = Math.floor(idx / grid.cols);
      const f = (g.get(idx) ?? Infinity) + heuristic(cx, cy, goal.cx, goal.cy);
      if (f < bestF) {
        bestF = f;
        currentIdx = idx;
      }
    }
    if (currentIdx === goalIdx) break;
    open.delete(currentIdx);
    closed.add(currentIdx);

    const cx = currentIdx % grid.cols;
    const cy = Math.floor(currentIdx / grid.cols);
    for (const [dx, dy, cost] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (isBlocked(grid, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (isBlocked(grid, cx + dx, cy) || isBlocked(grid, cx, cy + dy))) continue; // no corner-cutting

      const neighborIdx = index(grid, nx, ny);
      if (closed.has(neighborIdx)) continue;
      const tentativeG = (g.get(currentIdx) ?? Infinity) + cost;
      if (tentativeG < (g.get(neighborIdx) ?? Infinity)) {
        parent.set(neighborIdx, currentIdx);
        g.set(neighborIdx, tentativeG);
        open.add(neighborIdx);
      }
    }
  }

  if (!g.has(goalIdx)) return null;
  const path: { cx: number; cy: number }[] = [];
  let cursor: number | undefined = goalIdx;
  while (cursor !== undefined) {
    path.unshift({ cx: cursor % grid.cols, cy: Math.floor(cursor / grid.cols) });
    cursor = parent.get(cursor);
  }
  return path;
}

/** True if the straight segment a->b never crosses a blocked cell — sampled every half-cell, cheap at this grid's size. */
function hasLineOfSight(grid: PathGrid, a: Point, b: Point): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / (CELL_SIZE / 2)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const { cx, cy } = worldToCell(x, y);
    if (isBlocked(grid, cx, cy)) return false;
  }
  return true;
}

/** Line-of-sight string-pulling: greedily jumps each waypoint as far ahead as it can still see, so the raw staircase-y grid path reads as a handful of natural strides instead of a jagged one. */
function simplify(grid: PathGrid, from: Point, raw: readonly Point[]): Point[] {
  const result: Point[] = [];
  let anchor = from;
  let i = 0;
  while (i < raw.length) {
    let farthest = i;
    for (let j = i; j < raw.length; j++) {
      if (hasLineOfSight(grid, anchor, raw[j])) farthest = j;
      else break;
    }
    result.push(raw[farthest]);
    anchor = raw[farthest];
    i = farthest + 1;
  }
  return result;
}

/**
 * Finds a walkable path from (fromX, fromY) to (toX, toY), avoiding every
 * wall and piece of furniture the grid knows about. Returns world-space
 * waypoints (excluding the start point), simplified down to the few points
 * where the route actually needs to turn — or null if the goal is
 * unreachable (should not happen for a validated INTERACTABLE point, but a
 * navigation click is not worth crashing over).
 */
export function findPath(grid: PathGrid, fromX: number, fromY: number, toX: number, toY: number): Point[] | null {
  const startCell = worldToCell(fromX, fromY);
  const goalCell = worldToCell(toX, toY);
  const start = nearestOpenCell(grid, startCell.cx, startCell.cy);
  const goal = nearestOpenCell(grid, goalCell.cx, goalCell.cy);
  if (!start || !goal) return null;

  const cellPath = findGridPath(grid, start, goal);
  if (!cellPath || cellPath.length === 0) return null;

  const worldPath = cellPath.map(({ cx, cy }) => cellCenter(cx, cy));
  worldPath[worldPath.length - 1] = { x: toX, y: toY }; // land exactly on the interactable's point, not its cell center
  if (worldPath.length === 1) return worldPath;
  return simplify(grid, { x: fromX, y: fromY }, worldPath);
}
