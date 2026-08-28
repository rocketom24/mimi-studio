export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DoorSide = "north" | "south";

export interface DoorGap {
  side: DoorSide;
  offset: number;
  length: number;
}

export interface FurniturePiece {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  /** Whether Mimi collides with this piece. Defaults to true when omitted. */
  solid?: boolean;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomDef {
  id: string;
  label: string;
  tiles: TileRect;
  floorColor: number;
  doors: DoorGap[];
  furniture: FurniturePiece[];
}
