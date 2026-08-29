export type Level = 0 | 1;
export const LEVELS: readonly Level[] = [0, 1];

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DoorSide = "north" | "south" | "east" | "west";

export interface DoorGap {
  side: DoorSide;
  offset: number;
  length: number;
}

export type FurnitureKind =
  | "shelf"
  | "mat"
  | "tv"
  | "sofa"
  | "coffeeTable"
  | "desk"
  | "computer"
  | "chair"
  | "displayTable"
  | "workstation"
  | "workbench"
  | "toolStorage"
  | "bookshelf"
  | "books"
  | "console"
  | "smallTable"
  | "counter"
  | "fridge"
  | "diningTable"
  | "shower"
  | "sink"
  | "toilet"
  | "bed"
  | "nightstand";

export interface FurniturePiece {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  /** Whether Mimi collides with this piece. Defaults to true when omitted. */
  solid?: boolean;
  /** Which pixel-art shape to draw. Falls back to a plain shaded box when omitted. */
  kind?: FurnitureKind;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FloorType = "wood" | "tile" | "workshop";

export interface RoomDef {
  id: string;
  level: Level;
  label: string;
  tiles: TileRect;
  floorColor: number;
  floorType: FloorType;
  doors: DoorGap[];
  furniture: FurniturePiece[];
  /** Decorative-only window rects, in absolute world-pixel space, sitting on the room's border wall band. Never collides. */
  windows?: PixelRect[];
}

export interface StaircaseDef {
  id: string;
  level: Level;
  tiles: TileRect;
  trigger: TileRect;
  toLevel: Level;
  toTile: { x: number; y: number };
}
