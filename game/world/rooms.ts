import type { RoomDef, StaircaseDef } from "@/game/types/world";
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

/** Ground-floor stairwell nook: 51-59 x, 10-18 y. First-floor nook: 35-42 x, 10-18 y — between Bedroom and Study. */
export const STAIRCASES: StaircaseDef[] = [
  {
    id: "stairs-up",
    level: 0,
    tiles: { x: 55, y: 12, w: 3, h: 3 },
    toLevel: 1,
    toTile: { x: 38, y: 16 },
  },
  {
    id: "stairs-down",
    level: 1,
    tiles: { x: 38, y: 12, w: 3, h: 3 },
    toLevel: 0,
    toTile: { x: 55, y: 16 },
  },
];

/** Finds which room's tile rect contains a world-pixel point. Rooms never overlap, so this is unambiguous. Used to derive an interactable's level from its position. */
export function roomAt(worldX: number, worldY: number): RoomDef | undefined {
  return ROOMS.find((room) => {
    const x = px(room.tiles.x);
    const y = px(room.tiles.y);
    return worldX >= x && worldX < x + px(room.tiles.w) && worldY >= y && worldY < y + px(room.tiles.h);
  });
}
