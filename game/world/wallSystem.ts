import * as Phaser from "phaser";
import { TILE_SIZE, WALL_COLOR, WALL_HEIGHT_PX, WORLD_TILE_HEIGHT, WORLD_TILE_WIDTH } from "@/game/config/world";
import { ROOMS } from "@/game/world/rooms";
import { ARCH_PALETTE, darken, lighten } from "@/game/world/palette";
import { DEPTH, visualDepth } from "@/game/world/depth";
import { getCameraMode, project } from "@/game/world/projection";
import { mergeVerticalRuns } from "@/game/world/gridRects";
import type { PixelRect, RoomDef } from "@/game/types/world";

/** Cosmetic-only wall thickness for drawing (collision keeps the full tile — see computeWallRects vs the visual insets in createWalls). */
const VISUAL_WALL_THICKNESS_PX = 5;

const px = (tiles: number) => tiles * TILE_SIZE;

/** A single drawn wall segment, kept around so occlusionSystem can fade its front face live. */
export interface WallSegment {
  rect: PixelRect;
  graphics: Phaser.GameObjects.Graphics;
}

interface WallGap {
  /** "h" = a gap in a horizontal wall line (north/south doors), fixed at a world Y. "v" = a gap in a vertical wall line (east/west doors), fixed at a world X. */
  axis: "h" | "v";
  pos: number;
  from: number;
  to: number;
}

/** Every door gap declared by any room on this level, in world-pixel space. A shared wall between two rooms only needs ONE of them to declare the door — this list is matched purely by position, not by which room declared it, so it cuts the gap into both rooms' facing walls automatically (their footprints are laid out one tile apart in rooms.ts so both walls land on the same line). */
function collectDoorGaps(rooms: RoomDef[]): WallGap[] {
  const gaps: WallGap[] = [];
  for (const room of rooms) {
    const x = px(room.tiles.x);
    const y = px(room.tiles.y);
    const w = px(room.tiles.w);
    const h = px(room.tiles.h);
    for (const door of room.doors) {
      const from = px(door.offset) + (door.side === "north" || door.side === "south" ? x : y);
      const to = from + px(door.length);
      if (door.side === "north") gaps.push({ axis: "h", pos: y - TILE_SIZE, from, to });
      else if (door.side === "south") gaps.push({ axis: "h", pos: y + h, from, to });
      else if (door.side === "west") gaps.push({ axis: "v", pos: x - TILE_SIZE, from, to });
      else gaps.push({ axis: "v", pos: x + w, from, to });
    }
  }
  return gaps;
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

/**
 * Merges a wall-tile grid into rects: one rect per contiguous horizontal run
 * per row, then a second pass stacks consecutive same-(x, w) rows into one
 * taller rect — so a straight vertical wall line (a west/east border, an
 * interior divider) collapses into a single rect instead of one block per
 * tile-row. `excludeRow`, if given, is skipped entirely (used to hide the
 * drawn front border while keeping it solid via the un-excluded grid).
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

/**
 * Insets a collision-authoritative wall rect down to the thin cosmetic
 * thickness used for drawing, centered within the tile band. The thickness
 * axis is whichever dimension is smaller (a horizontal wall line is wide
 * and one-tile-thick in y; a vertical line is tall and one-tile-thick in
 * x); an isolated square tile (an unmerged corner stub) shrinks both.
 */
function insetForVisual(rect: PixelRect): PixelRect {
  const shrinkX = rect.w <= rect.h;
  const shrinkY = rect.h <= rect.w;
  const x = shrinkX ? rect.x + (rect.w - VISUAL_WALL_THICKNESS_PX) / 2 : rect.x;
  const y = shrinkY ? rect.y + (rect.h - VISUAL_WALL_THICKNESS_PX) / 2 : rect.y;
  const w = shrinkX ? VISUAL_WALL_THICKNESS_PX : rect.w;
  const h = shrinkY ? VISUAL_WALL_THICKNESS_PX : rect.h;
  return { x, y, w, h };
}

/**
 * Every wall rectangle in the house, in world-pixel space — this is the
 * collision-authoritative set (includes the south exterior border, which is
 * never drawn — see computeVisibleWallRects). Both the visual drawing and
 * the collision bodies are built from the same grid, so they can never
 * drift apart.
 */
export function computeWallRects(): PixelRect[] {
  return gridToRects(buildWallGrid());
}

/**
 * The DRAWN subset of computeWallRects(): the south (front, camera-facing)
 * border row is omitted so the house reads as an open-front dollhouse per
 * the reference image, while still colliding (see computeWallRects).
 * Interior walls and the north/west/east exterior borders draw normally.
 */
export function computeVisibleWallRects(): PixelRect[] {
  return gridToRects(buildWallGrid(), WORLD_TILE_HEIGHT - 1);
}

/**
 * Draws one world-space wall rect as a short 3D block: a footprint plate at
 * floor level, one tall face extruded along the wall's long axis, and a top
 * cap. All corners are individually projected so the block reads as a
 * slanted box under the fixed oblique camera.
 *
 * At the thin cosmetic wall thickness (see VISUAL_WALL_THICKNESS_PX) a rect
 * is long along one axis and a sliver along the other — a "horizontal" wall
 * line (w >= h) runs east-west on screen and its length shows on the south
 * edge; a "vertical" one (h > w) runs screen-diagonal (world Y is the long
 * axis under this projection) and its length shows on the east edge
 * instead. Only that one long face is drawn — extruding the short axis too
 * would just be a few-pixel sliver that reads as a stray diagonal streak,
 * not a depth cue.
 */
function drawWallBlock(g: Phaser.GameObjects.Graphics, fullRect: PixelRect, rect: PixelRect): void {
  const faceTop = lighten(WALL_COLOR, 10);
  const faceBottom = darken(WALL_COLOR, 12);
  const highlight = ARCH_PALETTE.wallHighlight;
  const capShade = darken(WALL_COLOR, 4);

  const nw = project(rect.x, rect.y);
  const ne = project(rect.x + rect.w, rect.y);
  const se = project(rect.x + rect.w, rect.y + rect.h);
  const sw = project(rect.x, rect.y + rect.h);

  // Footprint plate at the full (collision-authoritative) tile bounds, not the
  // thin cosmetic inset — every wall tile is drawn from the same boolean grid
  // floorSystem excludes and collision.ts collides against, so adjacent wall
  // rects always share exact tile edges (no gap to the floor, no seam at
  // corners/intersections) regardless of the thin face's own inset.
  const fnw = project(fullRect.x, fullRect.y);
  const fne = project(fullRect.x + fullRect.w, fullRect.y);
  const fse = project(fullRect.x + fullRect.w, fullRect.y + fullRect.h);
  const fsw = project(fullRect.x, fullRect.y + fullRect.h);
  g.fillStyle(WALL_COLOR, 1);
  g.fillPoints([fnw, fne, fse, fsw], true);

  // Long face: south edge for a horizontal wall line, east edge for a vertical one — both share the se corner.
  const isVertical = rect.h > rect.w;
  const faceBase = isVertical ? ne : sw;
  const faceBaseTop = isVertical
    ? project(rect.x + rect.w, rect.y, WALL_HEIGHT_PX)
    : project(rect.x, rect.y + rect.h, WALL_HEIGHT_PX);
  const seTop = project(rect.x + rect.w, rect.y + rect.h, WALL_HEIGHT_PX);
  g.fillStyle(faceBottom, 1);
  g.fillPoints([faceBase, se, seTop, faceBaseTop], true);
  const midBase = { x: faceBaseTop.x, y: faceBaseTop.y + Math.ceil(WALL_HEIGHT_PX / 2) };
  const midSe = { x: seTop.x, y: seTop.y + Math.ceil(WALL_HEIGHT_PX / 2) };
  g.fillStyle(faceTop, 0.9);
  g.fillPoints([faceBaseTop, seTop, midSe, midBase], true);

  // Top cap.
  const nwTop = project(rect.x, rect.y, WALL_HEIGHT_PX);
  const neTop = project(rect.x + rect.w, rect.y, WALL_HEIGHT_PX);
  const swTop = project(rect.x, rect.y + rect.h, WALL_HEIGHT_PX);
  g.fillStyle(capShade, 1);
  g.fillPoints([nwTop, neTop, seTop, swTop], true);
  g.lineStyle(1, highlight, 0.9);
  g.lineBetween(nwTop.x, nwTop.y, neTop.x, neTop.y);

  // Dark charcoal outline around the whole block, per the reference palette.
  g.lineStyle(1, ARCH_PALETTE.outline, 0.6);
  g.strokePoints([nwTop, neTop, seTop, swTop], true);
  g.lineBetween(faceBaseTop.x, faceBaseTop.y, faceBase.x, faceBase.y);
  g.lineBetween(seTop.x, seTop.y, se.x, se.y);
}

/**
 * Renders every drawn wall rect as a thin projected 3D block — visual
 * thickness only (see insetForVisual); collision keeps the full tile via
 * computeWallRects(), so Mimi can't clip through a corner even though the
 * drawn wall reads as an architectural line rather than a solid column.
 * Returns each segment with its full-tile rect (not the thin visual one) so
 * occlusionSystem's span/depth checks still match the actual doorway/corner
 * geometry.
 *
 * The south border cutaway (computeVisibleWallRects) is an isometric-only
 * concept — it exists so the elevated dollhouse view can see inside the
 * house. Looking straight down in top-down mode, nothing needs cutting away
 * to stay readable, and hiding it there would leave the floor plan looking
 * unclosed along that edge, so top-down draws every wall (computeWallRects).
 */
export function createWalls(scene: Phaser.Scene): WallSegment[] {
  const rects = getCameraMode() === "topdown" ? computeWallRects() : computeVisibleWallRects();
  const segments: WallSegment[] = [];
  for (const rect of rects) {
    const g = scene.add.graphics().setDepth(visualDepth(rect.y + rect.h));
    drawWallBlock(g, rect, insetForVisual(rect));
    segments.push({ rect, graphics: g });
  }
  return segments;
}

/**
 * Soft threshold shading at every doorway, projected onto the floor plane
 * exactly like a floor tile (see floorSystem's floorQuad). Doesn't touch the
 * gap geometry itself.
 *
 * The previous version drew corner "posts" and a threshold line with raw
 * `fillRect(screenAnchor, ...worldSizedExtent)` — passing an unprojected
 * world-pixel size straight in as a screen-pixel size. Under the isometric
 * shear those extents don't match screen space at all, so a "v"-axis gap
 * (whose world-space length runs along the diagonal Y axis on screen, not
 * straight down) rendered as a stray vertical bar many tiles tall: the
 * "brown debug lines" cutting across the floor. Every point drawn here goes
 * through project(), so it's correct in both camera modes and can never
 * drift from the wall/collision geometry that defines the gap.
 */
export function createDoorDecorations(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DEPTH.LABEL_BASE);

  for (const gap of collectDoorGaps(ROOMS)) {
    const rect: PixelRect =
      gap.axis === "h"
        ? { x: gap.from, y: gap.pos, w: gap.to - gap.from, h: TILE_SIZE }
        : { x: gap.pos, y: gap.from, w: TILE_SIZE, h: gap.to - gap.from };

    g.fillStyle(0x000000, 0.18);
    g.fillPoints(
      [
        project(rect.x, rect.y),
        project(rect.x + rect.w, rect.y),
        project(rect.x + rect.w, rect.y + rect.h),
        project(rect.x, rect.y + rect.h),
      ],
      true,
    );
  }

  return g;
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

    const bandY = win.y + (TILE_SIZE - VISUAL_WALL_THICKNESS_PX) / 2;
    const anchor = project(win.x, bandY);
    const h = VISUAL_WALL_THICKNESS_PX;

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
