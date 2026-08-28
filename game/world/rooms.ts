import type { RoomDef } from "@/game/types/world";

export const TOP_Y = 1;
export const TOP_H = 14;
export const BOTTOM_Y = 21;
export const BOTTOM_H = 14;

const COL_A_X = 1; // width 12
const COL_B_X = 14; // width 12
const COL_C_X = 27; // width 12
const COL_D_X = 40; // width 11
const COL_E_X = 52; // width 11
const WIDE = 12;
const NARROW = 11;

const DOOR = { offset: 4, length: 3 };

export const ROOMS: RoomDef[] = [
  {
    id: "entry",
    label: "ENTRY",
    tiles: { x: COL_A_X, y: TOP_Y, w: WIDE, h: TOP_H },
    floorColor: 0x2b2340,
    doors: [{ side: "south", ...DOOR }],
    furniture: [
      { x: 2, y: 2, w: 2, h: 1, color: 0x4a3a63 }, // mail / contact shelf
      { x: 8, y: 9, w: 3, h: 3, color: 0x1c1626, solid: false }, // mat
    ],
  },
  {
    id: "living-room",
    label: "LIVING ROOM",
    tiles: { x: COL_B_X, y: TOP_Y, w: WIDE, h: TOP_H },
    floorColor: 0x2e2440,
    doors: [{ side: "south", ...DOOR }],
    furniture: [
      { x: 2, y: 1, w: 4, h: 2, color: 0x1c1626 }, // TV
      { x: 2, y: 9, w: 6, h: 3, color: 0x6f5c9e }, // sofa
      { x: 4, y: 6, w: 2, h: 2, color: 0x8a5a3c }, // coffee table
    ],
  },
  {
    id: "office",
    label: "OFFICE",
    tiles: { x: COL_C_X, y: TOP_Y, w: WIDE, h: TOP_H },
    floorColor: 0x2a2b40,
    doors: [{ side: "south", ...DOOR }],
    furniture: [
      { x: 3, y: 2, w: 5, h: 2, color: 0x8a5a3c }, // desk
      { x: 4, y: 2, w: 2, h: 1, color: 0x4ad0e8, solid: false }, // computer (on desk)
      { x: 4, y: 4, w: 2, h: 2, color: 0x6f5c9e }, // chair
    ],
  },
  {
    id: "project-room",
    label: "PROJECTS",
    tiles: { x: COL_D_X, y: TOP_Y, w: NARROW, h: TOP_H },
    floorColor: 0x2b2b45,
    doors: [{ side: "south", ...DOOR }],
    furniture: [
      { x: 2, y: 3, w: 6, h: 3, color: 0x8a5a3c }, // project display table
      { x: 3, y: 8, w: 3, h: 2, color: 0x4ad0e8 }, // workstation
    ],
  },
  {
    id: "workshop",
    label: "WORKSHOP",
    tiles: { x: COL_E_X, y: TOP_Y, w: NARROW, h: TOP_H },
    floorColor: 0x332a2a,
    doors: [{ side: "south", ...DOOR }],
    furniture: [
      { x: 1, y: 2, w: 8, h: 2, color: 0x8a5a3c }, // workbench
      { x: 1, y: 5, w: 2, h: 3, color: 0x8894a3 }, // tool storage
    ],
  },
  {
    id: "study",
    label: "STUDY",
    tiles: { x: COL_A_X, y: BOTTOM_Y, w: WIDE, h: BOTTOM_H },
    floorColor: 0x2b2536,
    doors: [{ side: "north", ...DOOR }],
    furniture: [
      { x: 1, y: 9, w: 2, h: 4, color: 0x8a5a3c }, // bookshelf
      { x: 5, y: 10, w: 4, h: 2, color: 0x8a5a3c }, // desk
      { x: 6, y: 10, w: 2, h: 1, color: 0xd88c4a, solid: false }, // books (on desk)
    ],
  },
  {
    id: "game-room",
    label: "GAME ROOM",
    tiles: { x: COL_B_X, y: BOTTOM_Y, w: WIDE, h: BOTTOM_H },
    floorColor: 0x2a2440,
    doors: [{ side: "north", ...DOOR }],
    furniture: [
      { x: 2, y: 10, w: 3, h: 2, color: 0x4ad0e8 }, // console
      { x: 6, y: 10, w: 2, h: 2, color: 0x6f5c9e }, // chair
      { x: 6, y: 7, w: 2, h: 2, color: 0x8a5a3c }, // small table
    ],
  },
  {
    id: "kitchen",
    label: "KITCHEN",
    tiles: { x: COL_C_X, y: BOTTOM_Y, w: WIDE, h: BOTTOM_H },
    floorColor: 0x39332a,
    doors: [{ side: "north", ...DOOR }],
    furniture: [
      { x: 1, y: 10, w: 8, h: 2, color: 0x8894a3 }, // counter
      { x: 1, y: 6, w: 2, h: 3, color: 0xd8d8d8 }, // refrigerator
      { x: 5, y: 5, w: 3, h: 3, color: 0x8a5a3c }, // table
    ],
  },
  {
    id: "bathroom",
    label: "BATHROOM",
    tiles: { x: COL_D_X, y: BOTTOM_Y, w: NARROW, h: BOTTOM_H },
    floorColor: 0x243336,
    doors: [{ side: "north", ...DOOR }],
    furniture: [
      { x: 1, y: 9, w: 3, h: 3, color: 0xbfe6ea }, // shower
      { x: 5, y: 10, w: 2, h: 1, color: 0xd8d8d8 }, // sink
      { x: 7, y: 9, w: 2, h: 2, color: 0xd8d8d8 }, // toilet
    ],
  },
  {
    id: "bedroom",
    label: "BEDROOM",
    tiles: { x: COL_E_X, y: BOTTOM_Y, w: NARROW, h: BOTTOM_H },
    floorColor: 0x2c2438,
    doors: [{ side: "north", ...DOOR }],
    furniture: [
      { x: 1, y: 9, w: 5, h: 4, color: 0x6f5c9e }, // bed
      { x: 7, y: 9, w: 2, h: 2, color: 0x8a5a3c }, // nightstand
    ],
  },
];
