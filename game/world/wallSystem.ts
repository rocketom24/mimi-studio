import * as Phaser from "phaser";
import { TILE_SIZE, WALL_COLOR, WALL_HEIGHT_PX, WORLD_TILE_HEIGHT, WORLD_TILE_WIDTH } from "@/game/config/world";
import { ROOMS } from "@/game/world/rooms";
import { ARCH_PALETTE, darken, lighten } from "@/game/world/palette";
import { DEPTH, visualDepth } from "@/game/world/depth";
import { getCameraMode, project } from "@/game/world/projection";
import { mergeVerticalRuns } from "@/game/world/gridRects";
import type { DoorGap, PixelRect, RoomDef } from "@/game/types/world";

/**
 * Wall cross-section thickness, in world px — both camera modes draw (and
 * collide, see computeWallRects) at this same thin band instead of the full
 * TILE_SIZE tile depth, so isometric and top-down never show a different
 * wall width for the same physical wall, and walls read proportionate to
 * the widened doorways (see rooms.ts). Also the thickness windows recess
 * into (see createWindows).
 */
export const WALL_THICKNESS_PX = 6;

/**
 * Half the tile depth trimmed off each side when thinning a wall run down to
 * WALL_THICKNESS_PX — also how far in from the raw tile grid's edge the
 * house's own outer border sits (see clampToHouseBorder), which floorSystem
 * reuses so floor never renders past the walls' outer face.
 */
export const WALL_THICKNESS_PAD_PX = (TILE_SIZE - WALL_THICKNESS_PX) / 2;

const px = (tiles: number) => tiles * TILE_SIZE;

/** A single drawn wall segment, kept around so occlusionSystem can fade its front face live. */
export interface WallSegment {
  rect: PixelRect;
  graphics: Phaser.GameObjects.Graphics;
}

/**
 * Builds one wall tile exactly once per tile, however many rooms border it.
 * A boolean grid (not per-room rect drawing) is what makes this possible:
 * two adjacent rooms both "claiming" their shared divider tile, or a room's
 * corner tile being touched by both its north and west edge, just sets the
 * same cell twice — no duplicate overlapping rects, no uncovered corner
 * tiles (the old per-room-edge approach only walked straight runs and never
 * touched the diagonal corner tile, leaving a hole there).
 */
export function buildWallGrid(): boolean[][] {
  const grid: boolean[][] = Array.from({ length: WORLD_TILE_HEIGHT }, () => Array(WORLD_TILE_WIDTH).fill(false));
  const set = (tx: number, ty: number, value: boolean) => {
    if (tx >= 0 && tx < WORLD_TILE_WIDTH && ty >= 0 && ty < WORLD_TILE_HEIGHT) grid[ty][tx] = value;
  };

  for (let tx = 0; tx < WORLD_TILE_WIDTH; tx++) {
    set(tx, 0, true);
    set(tx, WORLD_TILE_HEIGHT - 1, true);
  }
  for (let ty = 0; ty < WORLD_TILE_HEIGHT; ty++) {
    set(0, ty, true);
    set(WORLD_TILE_WIDTH - 1, ty, true);
  }

  for (const room of ROOMS) {
    const { x, y, w, h } = room.tiles;
    for (let tx = x - 1; tx <= x + w; tx++) {
      set(tx, y - 1, true); // north, corners included
      set(tx, y + h, true); // south, corners included
    }
    for (let ty = y; ty < y + h; ty++) {
      set(x - 1, ty, true); // west
      set(x + w, ty, true); // east
    }
  }

  for (const room of ROOMS) {
    const { x, y, w, h } = room.tiles;
    for (const door of room.doors) {
      for (let i = 0; i < door.length; i++) {
        if (door.side === "north") set(x + door.offset + i, y - 1, false);
        else if (door.side === "south") set(x + door.offset + i, y + h, false);
        else if (door.side === "west") set(x - 1, y + door.offset + i, false);
        else set(x + w, y + door.offset + i, false);
      }
    }
  }

  return grid;
}

/** One door's world-space placement, as a hinge point plus the two unit directions its leaf swings between — see doorSystem.ts. */
export interface DoorPlacement {
  room: RoomDef;
  door: DoorGap;
  /** Fixed jamb corner the leaf pivots around. */
  hinge: { x: number; y: number };
  /** Unit vector the leaf spans when closed — along the wall line, plugging the gap. */
  closedDir: { x: number; y: number };
  /** Unit vector the leaf swings toward when open — perpendicular, into the room that declared it. */
  openDir: { x: number; y: number };
  /** Leaf length in world px (door.length tiles). */
  span: number;
}

/**
 * Placement for every declared door, in world-pixel space — read by
 * doorSystem.ts to draw and animate the visible leaf. Kept in lockstep with
 * buildWallGrid's own door-gap loop above (same room.doors data, same
 * per-side offset math) so the leaf can never drift from the actual wall
 * opening.
 *
 * `hinge` sits on the wall band's own centerline, not the room-facing tile
 * edge: the wall row/column a door cuts through draws as a WALL_THICKNESS_PX
 * band centered in its tile (see thinRect), and that center is always
 * exactly half a tile in from the room edge, regardless of THICKNESS_PX —
 * landing the door leaf's swing plane flush with the wall it's plugging
 * instead of floating TILE_SIZE/2 px out into the room.
 */
export function computeDoorPlacements(rooms: RoomDef[]): DoorPlacement[] {
  const placements: DoorPlacement[] = [];
  const half = TILE_SIZE / 2;
  for (const room of rooms) {
    const { x, y, w, h } = room.tiles;
    for (const door of room.doors) {
      const along = px(door.offset);
      const span = px(door.length);
      if (door.side === "north") {
        placements.push({ room, door, hinge: { x: px(x) + along, y: px(y) - half }, closedDir: { x: 1, y: 0 }, openDir: { x: 0, y: 1 }, span });
      } else if (door.side === "south") {
        placements.push({ room, door, hinge: { x: px(x) + along, y: px(y + h) + half }, closedDir: { x: 1, y: 0 }, openDir: { x: 0, y: -1 }, span });
      } else if (door.side === "west") {
        placements.push({ room, door, hinge: { x: px(x) - half, y: px(y) + along }, closedDir: { x: 0, y: 1 }, openDir: { x: 1, y: 0 }, span });
      } else {
        placements.push({ room, door, hinge: { x: px(x + w) + half, y: px(y) + along }, closedDir: { x: 0, y: 1 }, openDir: { x: -1, y: 0 }, span });
      }
    }
  }
  return placements;
}

/**
 * Merges a wall-tile grid into rects: one rect per contiguous horizontal run
 * per row, then a second pass stacks consecutive same-(x, w) rows into one
 * taller rect — so a straight vertical wall line (a west/east border, an
 * interior divider) collapses into a single rect instead of one block per
 * tile-row. `excludeRow`, if given, is skipped entirely (used to hide the
 * drawn front border while keeping it solid via the un-excluded grid).
 *
 * Every solid tile is assigned to exactly one rect (never two) — a
 * T-junction tile belongs to whichever run's row-scan absorbed it. Two
 * independent per-axis scans were tried instead (one rect per orientation
 * per tile), but at every joint that meant two separate 3D wall blocks
 * overlapping in isometric mode, and their edge outlines crossed into a
 * visible seam/spike instead of one clean corner. A single exclusive
 * partition draws exactly one block per joint; thinRect's end-pad (below) is
 * what closes the seam between adjacent exclusive rects instead.
 */
function gridToRects(grid: boolean[][], excludeRow?: number): PixelRect[] {
  const rowRuns: PixelRect[] = [];
  for (let ty = 0; ty < grid.length; ty++) {
    if (ty === excludeRow) continue;
    const row = grid[ty];
    let runStart = -1;
    for (let tx = 0; tx <= row.length; tx++) {
      const solid = tx < row.length && row[tx];
      if (solid && runStart === -1) runStart = tx;
      else if (!solid && runStart !== -1) {
        rowRuns.push({ x: px(runStart), y: px(ty), w: px(tx - runStart), h: TILE_SIZE });
        runStart = -1;
      }
    }
  }
  return mergeVerticalRuns(rowRuns.map((rect) => ({ key: "", rect }))).map((item) => item.rect);
}

/** Which axis a wall run is thin across — the other axis is its (possibly multi-tile) length. */
type WallOrientation = "horizontal" | "vertical";

function classifyRun(rect: PixelRect): WallOrientation {
  return rect.h <= rect.w ? "horizontal" : "vertical";
}

/**
 * Clips a rect to the house's own outer border — WALL_THICKNESS_PAD_PX in
 * from the raw tile-grid edge on every side, matching where a perimeter
 * wall's own thin band actually sits (see thinRect). A run whose raw tile
 * extent already reaches the grid edge (e.g. the north border spans every
 * column) has nothing to pad there, but its un-padded edge still lands
 * exactly on the grid edge — a full WALL_THICKNESS_PAD_PX past the
 * perpendicular wall's own inset band, so the two visibly failed to line up
 * at the corner. Clamping to the inset border instead of the raw grid edge
 * is what makes every exterior wall's outer face flush.
 */
export function clampToHouseBorder(rect: PixelRect): PixelRect {
  const pad = WALL_THICKNESS_PAD_PX;
  const maxX = px(WORLD_TILE_WIDTH) - pad;
  const maxY = px(WORLD_TILE_HEIGHT) - pad;
  const x0 = Math.max(pad, rect.x);
  const y0 = Math.max(pad, rect.y);
  const x1 = Math.min(maxX, rect.x + rect.w);
  const y1 = Math.min(maxY, rect.y + rect.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Shrinks one full-tile-thick run rect down to WALL_THICKNESS_PX, centered
 * on its thin axis, and extends its long axis by the trimmed-off pad on
 * whichever end(s) `padStart`/`padEnd` say actually meet another wall run.
 * That extension isn't cosmetic slack — when a run's end tile is where a
 * perpendicular run meets it (a corner or T-junction), the neighbor's own
 * thin band starts exactly one tile-pad short of the shared tile edge, and
 * padding this run out to meet it is what makes two thin bands actually
 * touch at the joint instead of leaving a gap (see gridToRects'
 * corner-tile-only-owned-by-one-run construction). An end with no such
 * neighbor — a door/archway gap, or open floor — gets no pad: nothing is
 * there to close a seam against, and padding anyway would just bite into
 * the open gap next to it. clampToHouseBorder then keeps whatever's left at
 * the house's own outer edge instead of the raw tile grid's.
 */
function thinRect(rect: PixelRect, padStart: boolean, padEnd: boolean): PixelRect {
  const pad = WALL_THICKNESS_PAD_PX;
  if (classifyRun(rect) === "horizontal") {
    const x = rect.x - (padStart ? pad : 0);
    const w = rect.w + (padStart ? pad : 0) + (padEnd ? pad : 0);
    return clampToHouseBorder({ x, y: rect.y + pad, w, h: WALL_THICKNESS_PX });
  }
  const y = rect.y - (padStart ? pad : 0);
  const h = rect.h + (padStart ? pad : 0) + (padEnd ? pad : 0);
  return clampToHouseBorder({ x: rect.x + pad, y, w: WALL_THICKNESS_PX, h });
}

/** One thinned wall run. */
interface WallRun {
  thin: PixelRect;
  orientation: WallOrientation;
}

function buildWallRuns(grid: boolean[][], excludeRow?: number): WallRun[] {
  return gridToRects(grid, excludeRow).map((rect) => {
    const orientation = classifyRun(rect);
    const tx = rect.x / TILE_SIZE;
    const ty = rect.y / TILE_SIZE;
    const tileLen = orientation === "horizontal" ? rect.w / TILE_SIZE : rect.h / TILE_SIZE;
    // Only pad an end toward a tile that's actually another wall run — a
    // door/archway gap or the world edge has nothing there to meet (see
    // thinRect).
    const padStart = orientation === "horizontal" ? isSolidTile(grid, tx - 1, ty) : isSolidTile(grid, tx, ty - 1);
    const padEnd =
      orientation === "horizontal" ? isSolidTile(grid, tx + tileLen, ty) : isSolidTile(grid, tx, ty + tileLen);
    return { thin: thinRect(rect, padStart, padEnd), orientation };
  });
}

/**
 * Every wall rectangle in the house, in world-pixel space, thinned to
 * WALL_THICKNESS_PX — this is the collision-authoritative set (includes the
 * south exterior border, which is never drawn — see computeVisibleWallRects).
 * Both the visual drawing and the collision bodies are built from the same
 * grid (and the same thinning), so they can never drift apart.
 */
export function computeWallRects(): PixelRect[] {
  return buildWallRuns(buildWallGrid()).map((run) => run.thin);
}

/**
 * The DRAWN subset of computeWallRects(): the south (front, camera-facing)
 * border row is omitted so the house reads as an open-front dollhouse per
 * the reference image, while still colliding (see computeWallRects).
 * Interior walls and the north/west/east exterior borders draw normally.
 */
export function computeVisibleWallRects(): PixelRect[] {
  return buildWallRuns(buildWallGrid(), WORLD_TILE_HEIGHT - 1).map((run) => run.thin);
}

/** A box's flat (z=0) footprint corners, in world-pixel space, walked in perimeter order (each entry adjacent to its neighbors) — see drawBox. */
export type BoxFootprint = readonly [WorldPoint, WorldPoint, WorldPoint, WorldPoint];
interface WorldPoint {
  x: number;
  y: number;
}

/**
 * Draws one world-space quad footprint as a short 3D block, at WALL_HEIGHT_PX
 * tall: a footprint plate at floor level, its two camera-facing side faces
 * extruded up, and a top cap. All corners are individually projected so the
 * block reads as a slanted box under the fixed oblique camera.
 *
 * The footprint doesn't have to be an axis-aligned rect — doorSystem.ts
 * reuses this for its (possibly rotated) door-leaf slab. Which two of the
 * quad's four edges are "camera-facing" isn't fixed to two hardcoded
 * corners: under this projection, larger (worldX + worldY) always projects
 * nearer the viewer (see projection.ts), so whichever corner maximizes that
 * sum is the box's nearest corner, and its two adjacent edges are the two
 * faces actually visible from the fixed camera. For an axis-aligned wall
 * rect that's always the south+east corner/edges (matching the old
 * hardcoded behavior); for a door leaf, which corner is nearest keeps
 * changing as it swings, so a fixed edge choice was drawing the FAR face on
 * roughly half of all doors/angles, leaving the near face — the one
 * actually facing the camera — blank.
 *
 * Both adjacent faces are drawn, not just whichever edge is longer: a real
 * box has two visible sides here, and skipping one left the short end of
 * every wall run looking like a folded flat card instead of a solid block.
 * The two faces share the near corner's top/base edge, so together they
 * read as one continuous corner.
 *
 * In top-down mode project() ignores z entirely, so every top point here
 * collapses onto its z=0 counterpart and both face quads degenerate to zero
 * area for free — only the flat footprint plate and its outline end up
 * visible, giving top-down its floor-plan look with no extra branching here.
 * (The faces' mid-height highlight band is computed via a real project(...,
 * WALL_HEIGHT_PX / 2) call rather than a screen-space offset for exactly
 * this reason — a fixed-pixel screen offset doesn't know to collapse to
 * zero in top-down, and used to leave a stray WALL_HEIGHT_PX/2-tall smear
 * hanging off every door there.)
 */
export function drawBox(g: Phaser.GameObjects.Graphics, corners: BoxFootprint, baseColor: number): void {
  const faceTop = lighten(baseColor, 10);
  const faceBottom = darken(baseColor, 12);
  const highlight = ARCH_PALETTE.wallHighlight;
  const capShade = darken(baseColor, 4);

  const base = corners.map((p) => project(p.x, p.y));
  const top = corners.map((p) => project(p.x, p.y, WALL_HEIGHT_PX));

  // Footprint plate — keeps the floor from ever showing through at the base.
  g.fillStyle(baseColor, 1);
  g.fillPoints(base, true);

  let nearIdx = 0;
  for (let i = 1; i < 4; i++) {
    if (corners[i].x + corners[i].y > corners[nearIdx].x + corners[nearIdx].y) nearIdx = i;
  }
  const prevIdx = (nearIdx + 3) % 4;
  const nextIdx = (nearIdx + 1) % 4;

  // One face, given its two corner indices (the shared "near" one, and its neighbor).
  const drawFace = (aIdx: number, bIdx: number) => {
    const baseA = base[aIdx];
    const baseB = base[bIdx];
    const topA = top[aIdx];
    const topB = top[bIdx];
    g.fillStyle(faceBottom, 1);
    g.fillPoints([baseA, baseB, topB, topA], true);
    const midA = project(corners[aIdx].x, corners[aIdx].y, WALL_HEIGHT_PX / 2);
    const midB = project(corners[bIdx].x, corners[bIdx].y, WALL_HEIGHT_PX / 2);
    g.fillStyle(faceTop, 0.9);
    g.fillPoints([topA, topB, midB, midA], true);
    g.lineStyle(1, ARCH_PALETTE.outline, 0.6);
    g.lineBetween(topA.x, topA.y, baseA.x, baseA.y);
    g.lineBetween(topB.x, topB.y, baseB.x, baseB.y);
  };

  // The near corner's two edges — they share its top/base point.
  drawFace(prevIdx, nearIdx);
  drawFace(nextIdx, nearIdx);

  // Top cap.
  g.fillStyle(capShade, 1);
  g.fillPoints(top, true);
  g.lineStyle(1, highlight, 0.9);
  g.lineBetween(top[0].x, top[0].y, top[1].x, top[1].y);

  // Dark charcoal outline around the whole block, per the reference palette.
  g.lineStyle(1, ARCH_PALETTE.outline, 0.6);
  g.strokePoints(top, true);
}

/** Wall-specific wrapper: a rect's own corners as a BoxFootprint, drawn in WALL_COLOR (see drawBox). */
function drawWallBlock(g: Phaser.GameObjects.Graphics, rect: PixelRect): void {
  drawBox(
    g,
    [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ],
    WALL_COLOR,
  );
}

function isSolidTile(grid: boolean[][], tx: number, ty: number): boolean {
  return ty >= 0 && ty < grid.length && tx >= 0 && tx < grid[ty].length && grid[ty][tx];
}

/**
 * Top-down wall rendering: flat fill of the thinned run rect (see
 * buildWallRuns), no bevel/shadow — a true floor-plan look, straight down
 * with no directional lighting cues.
 */
function drawWallRunTopDown(g: Phaser.GameObjects.Graphics, run: WallRun): void {
  const rect = run.thin;
  const nw = project(rect.x, rect.y);
  const ne = project(rect.x + rect.w, rect.y);
  const se = project(rect.x + rect.w, rect.y + rect.h);
  const sw = project(rect.x, rect.y + rect.h);

  g.fillStyle(WALL_COLOR, 1);
  g.fillPoints([nw, ne, se, sw], true);
}

/**
 * Renders every drawn wall run, at the same WALL_THICKNESS_PX in both camera
 * modes — isometric and top-down never show a different wall width for the
 * same physical wall. Isometric draws each run as one projected 3D block
 * (drawWallBlock); top-down draws it as a flat band with edge-aware bevels
 * (drawWallRunTopDown) so it reads as a real wall with depth rather than a
 * flat, seamed rectangle.
 *
 * The south border cutaway (computeVisibleWallRects) is an isometric-only
 * concept — it exists so the elevated dollhouse view can see inside the
 * house. Looking straight down in top-down mode, nothing needs cutting away
 * to stay readable, and hiding it there would leave the floor plan looking
 * unclosed along that edge, so top-down draws every wall (computeWallRects).
 */
export function createWalls(scene: Phaser.Scene): WallSegment[] {
  const isTopdown = getCameraMode() === "topdown";
  const grid = buildWallGrid();
  const runs = isTopdown ? buildWallRuns(grid) : buildWallRuns(grid, WORLD_TILE_HEIGHT - 1);
  const segments: WallSegment[] = [];
  for (const run of runs) {
    const rect = run.thin;
    const g = scene.add.graphics().setDepth(visualDepth(rect.y + rect.h));
    if (isTopdown) drawWallRunTopDown(g, run);
    else drawWallBlock(g, rect);
    segments.push({ rect, graphics: g });
  }
  return segments;
}

/**
 * A window's authored rect gives its span (x, w) and which tile row it sits
 * on (y); the actual drawn band is recentered onto the same thin cosmetic
 * thickness the wall itself now draws at, so the window reads as set into
 * the wall rather than floating at the old full-tile height.
 */
const WINDOW_SILL_PX = 2;

/** Decorative window: frame, glass, center mullion, sill ledge, subtle highlight — sized to the thin wall band. Never collides. Skipped when its wall row is cut away (front/open-side walls), so no window floats in front of nothing. Returns null when the room has none or none are visible. */
export function createWindows(scene: Phaser.Scene, room: RoomDef): Phaser.GameObjects.Graphics | null {
  if (!room.windows?.length) return null;
  const g = scene.add.graphics().setDepth(DEPTH.LABEL_BASE);
  let drewAny = false;

  for (const win of room.windows) {
    const wallRow = Math.round(win.y / TILE_SIZE);
    if (wallRow === WORLD_TILE_HEIGHT - 1) continue; // south border row is never drawn — its window shouldn't be either
    drewAny = true;

    const bandY = win.y + WALL_THICKNESS_PAD_PX;
    const anchor = project(win.x, bandY);
    const h = WALL_THICKNESS_PX;

    g.fillStyle(ARCH_PALETTE.windowFrame, 1);
    g.fillRect(anchor.x, anchor.y, win.w, h);

    const glassX = anchor.x + 1;
    const glassY = anchor.y + 1;
    const glassW = win.w - 2;
    const glassH = Math.max(1, h - 2);
    g.fillStyle(ARCH_PALETTE.windowGlass, 0.75);
    g.fillRect(glassX, glassY, glassW, glassH);

    g.fillStyle(lighten(ARCH_PALETTE.windowGlass, 40), 0.6);
    g.fillRect(glassX, glassY, glassW, 1);

    g.fillStyle(ARCH_PALETTE.windowFrame, 1);
    g.fillRect(anchor.x + Math.floor(win.w / 2), anchor.y, 1, h);

    // Sill: a short ledge below the frame reads as the window sitting in wall depth.
    g.fillStyle(darken(ARCH_PALETTE.windowFrame, 15), 1);
    g.fillRect(anchor.x - 1, anchor.y + h, win.w + 2, WINDOW_SILL_PX);
  }

  if (!drewAny) {
    g.destroy();
    return null;
  }
  return g;
}
