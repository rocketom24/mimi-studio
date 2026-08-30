import type { RoomDef } from "@/game/types/world";
import { TILE_SIZE } from "@/game/config/world";

const px = (tiles: number) => tiles * TILE_SIZE;

/**
 * Single-floor house rebuilt off the reference dollhouse image at a fixed
 * single camera angle (no rotation). Left column: Living Room over Cat
 * Room + Entrance. Right column: Bedroom + Study spans the full height —
 * former Kitchen/Bedroom-Study split is now one continuous room (kitchen
 * furniture deferred).
 *
 * Adjacent rooms keep exactly one empty tile of gap between their
 * footprints so both rooms' walls land on the same tile — one declared
 * door then cuts both sides at once.
 *
 * The 3 real doors (Living Room <-> Cat Room, Living Room <-> Bedroom +
 * Study, Entrance's exterior front door) are each 2 tiles — comfortably
 * wider than Mimi's body, see entities/Player.ts — and get a real animated
 * leaf drawn by doorSystem.ts
 * (computeDoorPlacements reads this same array, so the visual leaf can
 * never drift from the wall gap it's covering). Living Room's wide south
 * connection to Entrance stays an open archway, not a door.
 */
export const ROOMS: RoomDef[] = [
  {
    id: "living-room",
    label: "LIVING ROOM",
    tiles: { x: 1, y: 1, w: 13, h: 12 },
    floorColor: 0xa9784f,
    floorType: "wood",
    doors: [
      { side: "east", offset: 5, length: 2 }, // -> Bedroom + Study, the only door between them (Entrance has none)
      { side: "south", offset: 2, length: 2 }, // -> Cat Room
      { side: "south", offset: 7, length: 6 }, // -> Entrance, open archway (not a door)
    ],
    windows: [{ x: px(6), y: px(0), w: px(4), h: TILE_SIZE - 2 }],
    furniture: [],
  },
  {
    id: "cat-room",
    label: "CAT ROOM",
    tiles: { x: 1, y: 14, w: 6, h: 6 },
    floorColor: 0xa9784f,
    floorType: "wood",
    doors: [],
    furniture: [],
  },
  {
    id: "entrance",
    label: "ENTRANCE",
    tiles: { x: 8, y: 14, w: 6, h: 6 },
    floorColor: 0xa9784f,
    floorType: "wood",
    // South door sits on the world's exterior border row (see
    // config/world.ts WORLD_TILE_HEIGHT) — the main front entrance. offset
    // 2 centers a 2-tile door in Entrance's 6-tile width (world tiles
    // 10-11), straddling the player spawn column.
    doors: [{ side: "south", offset: 2, length: 2 }],
    furniture: [],
  },
  {
    id: "bedroom-study",
    label: "BEDROOM + STUDY",
    // Spans the full right-column height (was split into a separate Kitchen
    // room on top + Bedroom-Study below, with a dividing wall between them —
    // now one continuous room; the old dividing wall disappears on its own
    // since walls are generated purely from room footprints, not declared).
    tiles: { x: 15, y: 1, w: 8, h: 19 },
    floorColor: 0xb9895e,
    floorType: "wood",
    doors: [],
    windows: [{ x: px(17), y: px(0), w: px(3), h: TILE_SIZE - 2 }],
    furniture: [],
  },
];
