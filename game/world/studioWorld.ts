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
import type { RoomDef } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;

/** Fills a one-tile-tall horizontal wall row, leaving door-width gaps. */
function fillRowWithGaps(
  g: Phaser.GameObjects.Graphics,
  yTile: number,
  xStartTile: number,
  xEndTile: number,
  gaps: Array<{ x: number; length: number }>,
) {
  const y = px(yTile);
  const sorted = [...gaps].sort((a, b) => a.x - b.x);
  let cursor = xStartTile;
  for (const gap of sorted) {
    if (gap.x > cursor) g.fillRect(px(cursor), y, px(gap.x - cursor), TILE_SIZE);
    cursor = gap.x + gap.length;
  }
  if (cursor < xEndTile) g.fillRect(px(cursor), y, px(xEndTile - cursor), TILE_SIZE);
}

export function createStudioBackground(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(CORRIDOR_FLOOR_COLOR, 1);
  g.fillRect(0, 0, WORLD_PIXEL_WIDTH, WORLD_PIXEL_HEIGHT);
}

export function createWalls(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(WALL_COLOR, 1);

  // Outer border, with a front-door gap in the north wall.
  fillRowWithGaps(g, 0, 0, WORLD_TILE_WIDTH, [EXTERIOR_DOOR]);
  fillRowWithGaps(g, WORLD_TILE_HEIGHT - 1, 0, WORLD_TILE_WIDTH, []);
  g.fillRect(0, 0, TILE_SIZE, WORLD_PIXEL_HEIGHT);
  g.fillRect(px(WORLD_TILE_WIDTH - 1), 0, TILE_SIZE, WORLD_PIXEL_HEIGHT);

  const topRooms = ROOMS.filter((r) => r.tiles.y === TOP_Y);
  const bottomRooms = ROOMS.filter((r) => r.tiles.y === BOTTOM_Y);
  const doorGaps = (rooms: RoomDef[]) =>
    rooms.map((r) => ({ x: r.tiles.x + r.doors[0].offset, length: r.doors[0].length }));

  // Walls between the top/bottom rooms and the central corridor.
  fillRowWithGaps(g, TOP_Y + topRooms[0].tiles.h, 1, WORLD_TILE_WIDTH - 1, doorGaps(topRooms));
  fillRowWithGaps(g, BOTTOM_Y - 1, 1, WORLD_TILE_WIDTH - 1, doorGaps(bottomRooms));

  // Dividers between neighboring rooms in the same row (solid, no doors).
  for (const rooms of [topRooms, bottomRooms]) {
    for (let i = 0; i < rooms.length - 1; i++) {
      const dividerX = rooms[i].tiles.x + rooms[i].tiles.w;
      g.fillRect(px(dividerX), px(rooms[i].tiles.y), TILE_SIZE, px(rooms[i].tiles.h));
    }
  }
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
