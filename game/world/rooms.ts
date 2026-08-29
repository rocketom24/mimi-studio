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

/**
 * Ground-floor stairwell nook: x:51,w:8, y:10,h:8 (tiles 51-58, 10-17,
 * half-open per TileRect convention) — its west wall (x-1=50) meets Living
 * Room's east wall (2+48=50) exactly, so Living Room's east door opens
 * straight into it. First-floor nook: x:35,w:7, y:10,h:8 (tiles 35-41,
 * 10-17) — its west wall (35-1=34) meets Bedroom's east wall (2+32=34), and
 * its east wall (35+7=42) meets Study's west wall (43-1=42).
 *
 * `tiles` is the whole walled/walkable nook footprint (walls wrap it via
 * zoneEdgeWalls, unaffected by the trigger split below). `trigger` is the
 * sub-zone that actually starts the floor change — on the ground floor
 * that's the whole nook (Living Room is its only connecting room, so
 * there's no walkable path to protect), but on the first floor Bedroom
 * and Study both open into the SAME nook at the same height (world
 * y10-13), so the trigger is narrowed to the nook's bottom half only —
 * a straight walk between the two rooms at door height never enters it.
 * Each `toTile` lands just inside the DESTINATION room at its doorway
 * threshold (not inside the nook, and not inside the new narrower
 * trigger either), so arrival is never inside a trigger zone and no
 * re-trigger cooldown is needed.
 */
export const STAIRCASES: StaircaseDef[] = [
  {
    id: "stairs-up",
    level: 0,
    tiles: { x: 51, y: 10, w: 8, h: 8 },
    trigger: { x: 51, y: 10, w: 8, h: 8 },
    toLevel: 1,
    toTile: { x: 32, y: 11 },
  },
  {
    id: "stairs-down",
    level: 1,
    tiles: { x: 35, y: 10, w: 7, h: 8 },
    trigger: { x: 35, y: 14, w: 7, h: 4 },
    toLevel: 0,
    toTile: { x: 48, y: 15 },
  },
];
