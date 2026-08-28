import * as Phaser from "phaser";
import {
  CORRIDOR_FLOOR_COLOR,
  EXTERIOR_DOOR,
  TILE_SIZE,
  WALL_COLOR,
  WORLD_PIXEL_HEIGHT,
  WORLD_PIXEL_WIDTH,
  WORLD_TILE_HEIGHT,
  WORLD_TILE_WIDTH,
} from "@/game/config/world";
import { BOTTOM_Y, ROOMS, TOP_Y } from "@/game/world/rooms";
import type { PixelRect, RoomDef } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;

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
 * Every wall rectangle in the studio, in pixel space. This is the single
 * source of truth for wall geometry: both the visual drawing and the
 * collision bodies are built from it, so they can never drift apart.
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

export function createStudioBackground(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(CORRIDOR_FLOOR_COLOR, 1);
  g.fillRect(0, 0, WORLD_PIXEL_WIDTH, WORLD_PIXEL_HEIGHT);
}

export function createWalls(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(WALL_COLOR, 1);
  for (const rect of computeWallRects()) g.fillRect(rect.x, rect.y, rect.w, rect.h);
}

export function createRoom(scene: Phaser.Scene, room: RoomDef): void {
  const g = scene.add.graphics();
  g.fillStyle(room.floorColor, 1);
  g.fillRect(px(room.tiles.x), px(room.tiles.y), px(room.tiles.w), px(room.tiles.h));
}

export function createFurniture(scene: Phaser.Scene, room: RoomDef): void {
  const g = scene.add.graphics();
  for (const piece of room.furniture) {
    g.fillStyle(piece.color, 1);
    g.fillRect(
      px(room.tiles.x + piece.x),
      px(room.tiles.y + piece.y),
      px(piece.w),
      px(piece.h),
    );
  }
}

export function createRoomLabel(scene: Phaser.Scene, room: RoomDef): void {
  const centerX = px(room.tiles.x) + px(room.tiles.w) / 2;
  const topY = px(room.tiles.y) + 4;
  scene.add
    .text(centerX, topY, room.label, {
      fontFamily: "monospace",
      fontSize: "6px",
      color: "#d8cdf0",
    })
    .setOrigin(0.5, 0)
    .setAlpha(0.85);
}
