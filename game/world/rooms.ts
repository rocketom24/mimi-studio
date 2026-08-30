import type { RoomDef } from "@/game/types/world";
import { TILE_SIZE } from "@/game/config/world";

const px = (tiles: number) => tiles * TILE_SIZE;

/**
 * Single-floor house rebuilt off the reference dollhouse image at a fixed
 * single camera angle (no rotation). Left column: Living Room over Cat
 * Room + Entrance. Right column: Bedroom + Study spans the full height —
 * former Kitchen/Bedroom-Study split is now one continuous room (kitchen
 * furniture deferred). Front (south) wall open.
 *
 * Adjacent rooms keep exactly one empty tile of gap between their
 * footprints so both rooms' walls land on the same tile — one declared
 * door then cuts both sides at once.
 *
 * Every bottom-band room's south edge coincides with the world's south
 * border row (open-front cutaway, see wallSystem.computeVisibleWallRects).
 * That coincidence alone only hides the border strip *outside* any room's
 * footprint — each room's own south wall is still drawn unless it declares
 * a door there too, so every bottom room gets a near-full-width south door
 * to actually read as open, matching the reference.
 */
export const ROOMS: RoomDef[] = [
  {
    id: "living-room",
    label: "LIVING ROOM",
    tiles: { x: 1, y: 1, w: 13, h: 12 },
    floorColor: 0xa9784f,
    floorType: "wood",
    doors: [
      { side: "east", offset: 2, length: 5 }, // -> Bedroom + Study
      { side: "south", offset: 1, length: 4 }, // -> Cat Room
      { side: "south", offset: 7, length: 5 }, // -> Entrance
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
    doors: [{ side: "south", offset: 1, length: 4 }], // open front
    furniture: [],
  },
  {
    id: "entrance",
    label: "ENTRANCE",
    tiles: { x: 8, y: 14, w: 6, h: 6 },
    floorColor: 0xa9784f,
    floorType: "wood",
    doors: [
      { side: "east", offset: 1, length: 4 }, // -> Bedroom-Study
      { side: "south", offset: 1, length: 4 }, // open front
    ],
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
    doors: [{ side: "south", offset: 1, length: 6 }], // open front
    windows: [{ x: px(17), y: px(0), w: px(3), h: TILE_SIZE - 2 }],
    furniture: [],
  },
];
