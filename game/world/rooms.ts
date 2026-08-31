import type { RoomDef } from "@/game/types/world";
import { TILE_SIZE } from "@/game/config/world";
import { PALETTE } from "@/game/world/palette";

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
    // Door in from Living Room lands on the north wall at local columns
    // 2-3 (see Living Room's south door, offset 2 length 2) — every piece
    // below keeps that column span clear at the top of the room. Every
    // piece here is a real-photo sprite (see furnitureSystem.ts's
    // SPRITE_PATH) — `color` is unused for these kinds but still required
    // by FurniturePiece, so it's set to something plausible.
    //
    // These sprite kinds render at SPRITE_DISPLAY_WIDTH (furnitureSystem.ts),
    // which is independent of (and considerably bigger than) the collision
    // footprint (w/h) below — catTree's 1x1 footprint draws as a 2.0x3.3-tile
    // image, catBed's 1.8x1.3 draws as 2.2x1.4, etc. Spacing pieces by their
    // small collision footprints alone (as this used to) put their real
    // rendered art on top of each other. Positions below are chosen against
    // the actual rendered image size instead, checked to have zero
    // screen-space overlap between any two pieces.
    //
    // The fixed camera projects local room coords as screenX=(x-y),
    // screenY=(x+y) (see projection.ts) — a room's 4 visual screen corners
    // are NOT its 4 (x,y) corners: visual-north=(x0,y0), visual-east=(x1,y0),
    // visual-south=(x1,y1), visual-west=(x0,y1). The upper-left screen edge
    // (north point to west point) reads as "the left side" of the room, so
    // tree/bed both sit along it — tree near the top (beside the door), bed
    // further down toward the west point (bottom-left) — spaced apart in y
    // so their real art doesn't collide. Litter sits along the south-east
    // edge, biased toward its south end (bottom-right).
    furniture: [
      { x: 0.5, y: 0.9, w: 1.0, h: 1.0, color: 0xc9773a, kind: "catTree" },
      { x: 0.7, y: 4.6, w: 1.8, h: 1.3, color: 0xe08a45, kind: "catBed" },
      { x: 2.8, y: 5.2, w: 0.9, h: 0.35, color: PALETTE.blue, kind: "foodBowl", solid: false },
      { x: 4.7, y: 4.0, w: 1.1, h: 0.9, color: PALETTE.green, kind: "catLitterBox" },
      { x: 2.3, y: 1.1, w: 0.4, h: 0.25, color: 0xd97a3a, kind: "catToy", solid: false },
      { x: 3.4, y: 1.5, w: 0.4, h: 0.25, color: 0xd97a3a, kind: "catToy", solid: false },
      { x: 2.8, y: 2.3, w: 0.4, h: 0.25, color: 0xd97a3a, kind: "catToy", solid: false },
    ],
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
