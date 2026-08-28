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
import { BOTTOM_Y, ROOMS, TOP_H, TOP_Y } from "@/game/world/rooms";
import { darken, lighten } from "@/game/world/palette";
import { DEPTH, visualDepth } from "@/game/world/depth";
import { project, toViewRect } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";
import type { PixelRect, RoomDef } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;

/** A single drawn wall segment, kept around so occlusionSystem can fade its front face live. `rect` stays world-space. */
export interface WallSegment {
  rect: PixelRect;
  graphics: Phaser.GameObjects.Graphics;
}

/** One-tile-tall horizontal wall row, split into segments that leave door-width gaps. */
function rowSegments(
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
 * Every wall rectangle in the studio, in world-pixel space. This is the
 * single source of truth for wall geometry: both the visual drawing and the
 * collision bodies are built from it (in world space, never rotated), so
 * they can never drift apart and physics never sees a camera orientation.
 */
export function computeWallRects(): PixelRect[] {
  const topRooms = ROOMS.filter((r) => r.tiles.y === TOP_Y);
  const bottomRooms = ROOMS.filter((r) => r.tiles.y === BOTTOM_Y);
  const doorGaps = (rooms: RoomDef[]) =>
    rooms.map((r) => ({ x: r.tiles.x + r.doors[0].offset, length: r.doors[0].length }));

  const rects: PixelRect[] = [
    // Outer border, with a front-door gap in the north wall.
    ...rowSegments(0, 0, WORLD_TILE_WIDTH, [EXTERIOR_DOOR]),
    ...rowSegments(WORLD_TILE_HEIGHT - 1, 0, WORLD_TILE_WIDTH, []),
    { x: 0, y: 0, w: TILE_SIZE, h: WORLD_PIXEL_HEIGHT },
    { x: px(WORLD_TILE_WIDTH - 1), y: 0, w: TILE_SIZE, h: WORLD_PIXEL_HEIGHT },
    // Walls between the top/bottom rooms and the central corridor.
    ...rowSegments(TOP_Y + topRooms[0].tiles.h, 1, WORLD_TILE_WIDTH - 1, doorGaps(topRooms)),
    ...rowSegments(BOTTOM_Y - 1, 1, WORLD_TILE_WIDTH - 1, doorGaps(bottomRooms)),
  ];

  // Dividers between neighboring rooms in the same row (solid, no doors).
  for (const rooms of [topRooms, bottomRooms]) {
    for (let i = 0; i < rooms.length - 1; i++) {
      const dividerX = rooms[i].tiles.x + rooms[i].tiles.w;
      rects.push({ x: px(dividerX), y: px(rooms[i].tiles.y), w: TILE_SIZE, h: px(rooms[i].tiles.h) });
    }
  }

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
export function createWalls(scene: Phaser.Scene, orientation: ViewOrientation): WallSegment[] {
  const segments: WallSegment[] = [];
  for (const rect of computeWallRects()) {
    const view = toViewRect(rect, orientation);
    const g = scene.add.graphics().setDepth(visualDepth(rect.x + rect.w / 2, rect.y + rect.h, orientation));
    drawWallBlock(g, view);
    segments.push({ rect, graphics: g });
  }
  return segments;
}

/** Every doorway gap in the studio, in world-pixel space — for cosmetic frames only, mirrors the gap math in computeWallRects(). */
function computeDoorGaps(): PixelRect[] {
  const topRooms = ROOMS.filter((r) => r.tiles.y === TOP_Y);
  const bottomRooms = ROOMS.filter((r) => r.tiles.y === BOTTOM_Y);
  const gapsFor = (rooms: RoomDef[], rowY: number): PixelRect[] =>
    rooms.map((r) => ({
      x: px(r.tiles.x + r.doors[0].offset),
      y: px(rowY),
      w: px(r.doors[0].length),
      h: TILE_SIZE,
    }));

  return [
    { x: px(EXTERIOR_DOOR.x), y: 0, w: px(EXTERIOR_DOOR.length), h: TILE_SIZE },
    ...gapsFor(topRooms, TOP_Y + TOP_H),
    ...gapsFor(bottomRooms, BOTTOM_Y - 1),
  ];
}

/** Cosmetic frame posts, threshold line, and soft shadow at every doorway. Doesn't touch the gap geometry itself. */
export function createDoorDecorations(scene: Phaser.Scene, orientation: ViewOrientation): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DEPTH.LABEL_BASE);
  const postColor = darken(WALL_COLOR, 20);
  const thresholdColor = darken(WALL_COLOR, 34);

  for (const gap of computeDoorGaps()) {
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
