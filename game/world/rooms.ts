import type { Level, RoomDef, StaircaseDef } from "@/game/types/world";
import { TILE_SIZE } from "@/game/config/world";

const px = (tiles: number) => tiles * TILE_SIZE;

export const ROOMS: RoomDef[] = [
  {
    id: "entrance",
    level: 0,
    label: "ENTRANCE",
    tiles: { x: 4, y: 1, w: 12, h: 8 },
    floorColor: 0x2b2340,
    floorType: "wood",
    doors: [
      { side: "north", offset: 4, length: 3 },
      { side: "south", offset: 4, length: 3 },
    ],
    furniture: [
      { x: 2, y: 1, w: 2, h: 1, color: 0x4a3a63, kind: "shelf" },
      { x: 5, y: 5, w: 3, h: 2, color: 0x1c1626, solid: false, kind: "mat" },
    ],
  },
  {
    id: "living-room",
    level: 0,
    label: "LIVING ROOM",
    tiles: { x: 2, y: 10, w: 48, h: 16 },
    floorColor: 0x2e2440,
    floorType: "wood",
    doors: [{ side: "east", offset: 4, length: 3 }],
    windows: [{ x: px(20), y: px(9), w: px(4), h: TILE_SIZE - 2 }],
    furniture: [
      { x: 3, y: 1, w: 4, h: 2, color: 0x1c1626, kind: "tv" },
      { x: 3, y: 9, w: 7, h: 3, color: 0x6f5c9e, kind: "sofa" },
      { x: 5, y: 6, w: 2, h: 2, color: 0x8a5a3c, kind: "coffeeTable" },
      { x: 40, y: 2, w: 2, h: 1, color: 0x4a3a63, kind: "shelf" },
    ],
  },
  {
    id: "kitchen",
    level: 0,
    label: "KITCHEN",
    tiles: { x: 2, y: 27, w: 22, h: 7 },
    floorColor: 0x39332a,
    floorType: "tile",
    doors: [{ side: "north", offset: 9, length: 3 }],
    furniture: [
      { x: 1, y: 1, w: 2, h: 3, color: 0xd8d8d8, kind: "fridge" },
      { x: 1, y: 4, w: 8, h: 2, color: 0x8894a3, kind: "counter" },
      { x: 12, y: 2, w: 3, h: 3, color: 0x8a5a3c, kind: "diningTable" },
    ],
  },
  {
    id: "cat-room",
    level: 0,
    label: "CAT ROOM",
    tiles: { x: 28, y: 27, w: 22, h: 7 },
    floorColor: 0x2c2438,
    floorType: "wood",
    doors: [{ side: "north", offset: 9, length: 3 }],
    furniture: [],
  },
  {
    id: "bedroom",
    level: 1,
    label: "BEDROOM",
    tiles: { x: 2, y: 6, w: 32, h: 22 },
    floorColor: 0x2c2438,
    floorType: "wood",
    doors: [{ side: "east", offset: 4, length: 3 }],
    windows: [{ x: px(15), y: px(5), w: px(4), h: TILE_SIZE - 2 }],
    furniture: [
      { x: 2, y: 3, w: 6, h: 4, color: 0x6f5c9e, kind: "bed" },
      { x: 9, y: 3, w: 2, h: 2, color: 0x8a5a3c, kind: "nightstand" },
      { x: 2, y: 14, w: 2, h: 5, color: 0x8a5a3c, kind: "bookshelf" },
    ],
  },
  {
    id: "study",
    level: 1,
    label: "STUDY + COMPUTER",
    tiles: { x: 43, y: 6, w: 17, h: 22 },
    floorColor: 0x2b2536,
    floorType: "wood",
    doors: [{ side: "west", offset: 4, length: 3 }],
    furniture: [
      { x: 2, y: 3, w: 5, h: 2, color: 0x8a5a3c, kind: "desk" },
      { x: 3, y: 3, w: 2, h: 1, color: 0x4ad0e8, solid: false, kind: "computer" },
      { x: 3, y: 5, w: 2, h: 2, color: 0x6f5c9e, kind: "chair" },
      { x: 10, y: 3, w: 2, h: 5, color: 0x8a5a3c, kind: "bookshelf" },
      { x: 2, y: 12, w: 3, h: 2, color: 0x4ad0e8, kind: "workstation" },
      { x: 7, y: 12, w: 6, h: 3, color: 0x8a5a3c, kind: "displayTable" },
    ],
  },
];

/**
 * Ground-floor stairwell nook: 51-59 x, 10-18 y — its west wall (x-1=50)
 * meets Living Room's east wall (2+48=50) exactly, so Living Room's east
 * door opens straight into it. First-floor nook: 35-42 x, 10-18 y — its
 * west wall (35-1=34) meets Bedroom's east wall (2+32=34), and its east
 * wall (35+7=42) meets Study's west wall (43-1=42).
 *
 * The whole nook rect IS the transition trigger (no separate smaller
 * "step" sub-zone) — stepping anywhere in it starts the floor change.
 * Each `toTile` lands just inside the DESTINATION room at its doorway
 * threshold (not inside the nook), so arrival is never inside a trigger
 * zone and no re-trigger cooldown is needed.
 */
export const STAIRCASES: StaircaseDef[] = [
  {
    id: "stairs-up",
    level: 0,
    tiles: { x: 51, y: 10, w: 8, h: 8 },
    toLevel: 1,
    toTile: { x: 32, y: 11 },
  },
  {
    id: "stairs-down",
    level: 1,
    tiles: { x: 35, y: 10, w: 7, h: 8 },
    toLevel: 0,
    toTile: { x: 48, y: 15 },
  },
];

/**
 * Finds which room ON A GIVEN LEVEL has a tile rect containing a world-pixel
 * point. Rooms never overlap within one level, but both levels deliberately
 * reuse the identical 0-512x0-288 coordinate space — so `level` is required,
 * not optional: without it, a point inside both a level-0 and a level-1
 * room's rect would resolve to whichever room happens to appear first in
 * `ROOMS`, silently misattributing it. Used to test whether a world point
 * (e.g. an interactable's position) belongs to a specific level.
 */
export function roomAt(worldX: number, worldY: number, level: Level): RoomDef | undefined {
  return ROOMS.find((room) => {
    if (room.level !== level) return false;
    const x = px(room.tiles.x);
    const y = px(room.tiles.y);
    return worldX >= x && worldX < x + px(room.tiles.w) && worldY >= y && worldY < y + px(room.tiles.h);
  });
}
