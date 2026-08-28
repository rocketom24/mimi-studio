import * as Phaser from "phaser";
import {
  TILE_SIZE,
  WALL_COLOR,
  WALL_HEIGHT_PX,
  EXTERIOR_DOOR,
  WORLD_PIXEL_HEIGHT,
  WORLD_TILE_HEIGHT,
  WORLD_TILE_WIDTH,
} from "@/game/config/world";
import { ROOMS, STAIRCASES } from "@/game/world/rooms";
import { darken, lighten } from "@/game/world/palette";
import { DEPTH, visualDepth } from "@/game/world/depth";
import { project, toViewRect } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";
import type { PixelRect, RoomDef } from "@/game/types/world";
import type { Level } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;

/** A single drawn wall segment, kept around so occlusionSystem can fade its front face live. `rect` stays world-space. */
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

/** Every door gap declared by any room on this level, in world-pixel space. A shared wall between two rooms only needs ONE of them to declare the door — this list is matched purely by position, not by which room declared it, so it cuts the gap into both rooms' facing walls automatically. */
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
      if (door.side === "north") gaps.push({ axis: "h", pos: y, from, to });
      else if (door.side === "south") gaps.push({ axis: "h", pos: y + h, from, to });
      else if (door.side === "west") gaps.push({ axis: "v", pos: x, from, to });
      else gaps.push({ axis: "v", pos: x + w, from, to });
    }
  }
  return gaps;
}

/** One wall line (fixed at `pos` on `axis`, spanning `[spanStart, spanEnd)`), split into segments that leave gaps for whichever WallGaps land on this exact line. */
function wallLine(axis: "h" | "v", pos: number, spanStart: number, spanEnd: number, gaps: WallGap[]): PixelRect[] {
  const onThisLine = gaps
    .filter((g) => g.axis === axis && g.pos === pos)
    .sort((a, b) => a.from - b.from);
  const rects: PixelRect[] = [];
  let cursor = spanStart;
  for (const gap of onThisLine) {
    if (gap.from > cursor) {
      rects.push(axis === "h" ? { x: cursor, y: pos, w: gap.from - cursor, h: TILE_SIZE } : { x: pos, y: cursor, w: TILE_SIZE, h: gap.from - cursor });
    }
    cursor = Math.max(cursor, gap.to);
  }
  if (cursor < spanEnd) {
    rects.push(axis === "h" ? { x: cursor, y: pos, w: spanEnd - cursor, h: TILE_SIZE } : { x: pos, y: cursor, w: TILE_SIZE, h: spanEnd - cursor });
  }
  return rects;
}

/** All 4 wall-bearing edges of one rect-shaped zone (a room or a staircase nook), each edge occupying the tile row/column immediately outside the zone's own footprint — never overlapping its floor. */
function zoneEdgeWalls(tiles: { x: number; y: number; w: number; h: number }, gaps: WallGap[]): PixelRect[] {
  const x = px(tiles.x);
  const y = px(tiles.y);
  const w = px(tiles.w);
  const h = px(tiles.h);
  return [
    ...wallLine("h", y - TILE_SIZE, x, x + w, gaps), // north
    ...wallLine("h", y + h, x, x + w, gaps), // south
    ...wallLine("v", x - TILE_SIZE, y, y + h, gaps), // west
    ...wallLine("v", x + w, y, y + h, gaps), // east
  ];
}

/** One-tile-tall horizontal wall row, split into segments that leave door-width gaps. Used for just the two full-width border rows — the exterior door is a gap in world-tile-x terms, unlike interior doors which are pixel-based WallGaps. */
function rowSegmentsForBorder(
  yTile: number,
  xStartTile: number,
  xEndTile: number,
  gaps: Array<{ x: number; length: number }>,
): PixelRect[] {
  const y = px(yTile);
  const sorted = [...gaps].sort((a, b) => a.x - b.x);
  const segments: PixelRect[] = [];
  let cursor = xStartTile;
  for (const gap of sorted) {
    if (gap.x > cursor) segments.push({ x: px(cursor), y, w: px(gap.x - cursor), h: TILE_SIZE });
    cursor = gap.x + gap.length;
  }
  if (cursor < xEndTile) segments.push({ x: px(cursor), y, w: px(xEndTile - cursor), h: TILE_SIZE });
  return segments;
}

/**
 * Every wall rectangle for one level of the studio, in world-pixel space.
 * This is the single source of truth for wall geometry: both the visual
 * drawing and the collision bodies are built from it (in world space, never
 * rotated), so they can never drift apart and physics never sees a camera
 * orientation.
 */
export function computeWallRects(level: Level): PixelRect[] {
  const rooms = ROOMS.filter((r) => r.level === level);
  const stairs = STAIRCASES.filter((s) => s.level === level);
  const gaps = collectDoorGaps(rooms);

  const exteriorGaps = level === 0 ? [EXTERIOR_DOOR] : [];
  const rects: PixelRect[] = [
    ...rowSegmentsForBorder(0, 0, WORLD_TILE_WIDTH, exteriorGaps),
    ...rowSegmentsForBorder(WORLD_TILE_HEIGHT - 1, 0, WORLD_TILE_WIDTH, []),
    { x: 0, y: 0, w: TILE_SIZE, h: WORLD_PIXEL_HEIGHT },
    { x: px(WORLD_TILE_WIDTH - 1), y: 0, w: TILE_SIZE, h: WORLD_PIXEL_HEIGHT },
  ];

  for (const room of rooms) rects.push(...zoneEdgeWalls(room.tiles, gaps));
  for (const stair of stairs) rects.push(...zoneEdgeWalls(stair.tiles, gaps));

  return rects;
}

/**
 * Draws one view-space wall rect as a short 3D block: a footprint plate at
 * floor level, a tall front (near-camera edge) face rising WALL_HEIGHT_PX,
 * an edge sliver for depth on thin dividers, and a top cap. All four
 * corners are individually projected so the block reads as a slanted box
 * under the oblique camera. `rect` is already view-space (toViewRect'd) —
 * in view space "near edge" (max Y) and "shear-forward edge" (max X) are
 * always the same two edges regardless of which of the four camera
 * orientations produced this rect, so this body never needs to branch on
 * orientation itself.
 */
function drawWallBlock(g: Phaser.GameObjects.Graphics, rect: PixelRect): void {
  const faceTop = lighten(WALL_COLOR, 12);
  const faceBottom = darken(WALL_COLOR, 8);
  const highlight = lighten(WALL_COLOR, 28);
  const capShade = darken(WALL_COLOR, 4);

  const nw = project(rect.x, rect.y);
  const ne = project(rect.x + rect.w, rect.y);
  const se = project(rect.x + rect.w, rect.y + rect.h);
  const sw = project(rect.x, rect.y + rect.h);

  // Footprint plate (floor-level base the wall stands on).
  g.fillStyle(WALL_COLOR, 1);
  g.fillPoints([nw, ne, se, sw], true);

  // Front face: the near-camera edge extruded upward.
  const swTop = project(rect.x, rect.y + rect.h, WALL_HEIGHT_PX);
  const seTop = project(rect.x + rect.w, rect.y + rect.h, WALL_HEIGHT_PX);
  g.fillStyle(faceBottom, 1);
  g.fillPoints([sw, se, seTop, swTop], true);
  const midSw = { x: swTop.x, y: swTop.y + Math.ceil(WALL_HEIGHT_PX / 2) };
  const midSe = { x: seTop.x, y: seTop.y + Math.ceil(WALL_HEIGHT_PX / 2) };
  g.fillStyle(faceTop, 0.9);
  g.fillPoints([swTop, seTop, midSe, midSw], true);

  // Shear-forward edge sliver: gives thin dividers a visible height cue too.
  const neTop = project(rect.x + rect.w, rect.y, WALL_HEIGHT_PX);
  g.fillStyle(darken(WALL_COLOR, 16), 0.85);
  g.fillPoints([ne, se, seTop, neTop], true);

  // Top cap.
  const nwTop = project(rect.x, rect.y, WALL_HEIGHT_PX);
  g.fillStyle(capShade, 1);
  g.fillPoints([nwTop, neTop, seTop, swTop], true);
  g.lineStyle(1, highlight, 0.8);
  g.lineBetween(nwTop.x, nwTop.y, neTop.x, neTop.y);
}

/** Renders every wall rect (for one camera orientation) as a projected 3D block. Returns each segment (world-space rect kept) so occlusionSystem can fade front walls live. */
export function createWalls(scene: Phaser.Scene, orientation: ViewOrientation, level: Level): WallSegment[] {
  const segments: WallSegment[] = [];
  for (const rect of computeWallRects(level)) {
    const view = toViewRect(rect, orientation);
    const g = scene.add.graphics().setDepth(visualDepth(rect.x + rect.w / 2, rect.y + rect.h, orientation));
    drawWallBlock(g, view);
    segments.push({ rect, graphics: g });
  }
  return segments;
}

/** Cosmetic frame posts, threshold line, and soft shadow at every doorway. Doesn't touch the gap geometry itself. */
export function createDoorDecorations(scene: Phaser.Scene, orientation: ViewOrientation, level: Level): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DEPTH.LABEL_BASE);
  const postColor = darken(WALL_COLOR, 20);
  const thresholdColor = darken(WALL_COLOR, 34);

  const rooms = ROOMS.filter((r) => r.level === level);
  const gaps = collectDoorGaps(rooms);
  const gapRects: PixelRect[] = gaps.map((gap) =>
    gap.axis === "h"
      ? { x: gap.from, y: gap.pos, w: gap.to - gap.from, h: TILE_SIZE }
      : { x: gap.pos, y: gap.from, w: TILE_SIZE, h: gap.to - gap.from },
  );
  if (level === 0) {
    gapRects.push({ x: px(EXTERIOR_DOOR.x), y: 0, w: px(EXTERIOR_DOOR.length), h: TILE_SIZE });
  }

  for (const gap of gapRects) {
    const view = toViewRect(gap, orientation);
    const anchor = project(view.x, view.y);

    g.fillStyle(postColor, 1);
    g.fillRect(anchor.x, anchor.y, 2, view.h);
    g.fillRect(anchor.x + view.w - 2, anchor.y, 2, view.h);

    g.fillStyle(thresholdColor, 0.6);
    g.fillRect(anchor.x + 2, anchor.y + view.h - 2, view.w - 4, 2);

    g.fillStyle(0x000000, 0.22);
    g.fillRect(anchor.x + 2, anchor.y + view.h, view.w - 4, 1);
  }

  return g;
}

/** Decorative window: frame, glass, center divider, subtle highlight. Never collides — sits within the wall band it's given. Returns null when the room has none. */
export function createWindows(
  scene: Phaser.Scene,
  room: RoomDef,
  orientation: ViewOrientation,
): Phaser.GameObjects.Graphics | null {
  if (!room.windows?.length) return null;
  const g = scene.add.graphics().setDepth(DEPTH.LABEL_BASE);

  for (const win of room.windows) {
    const view = toViewRect(win, orientation);
    const anchor = project(view.x, view.y);

    g.fillStyle(darken(WALL_COLOR, 10), 1);
    g.fillRect(anchor.x, anchor.y, view.w, view.h);

    const glassX = anchor.x + 1;
    const glassY = anchor.y + 1;
    const glassW = view.w - 2;
    const glassH = view.h - 2;
    g.fillStyle(0x9fd8e0, 0.55);
    g.fillRect(glassX, glassY, glassW, glassH);

    g.fillStyle(lighten(WALL_COLOR, 40), 0.8);
    g.fillRect(glassX, glassY, glassW, 1);

    g.fillStyle(darken(WALL_COLOR, 10), 1);
    g.fillRect(anchor.x + Math.floor(view.w / 2), anchor.y, 1, view.h);
  }

  return g;
}
