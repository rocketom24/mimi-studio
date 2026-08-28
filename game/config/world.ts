export const TILE_SIZE = 8;
export const WORLD_TILE_WIDTH = 64;
export const WORLD_TILE_HEIGHT = 36;
export const WORLD_PIXEL_WIDTH = WORLD_TILE_WIDTH * TILE_SIZE;
export const WORLD_PIXEL_HEIGHT = WORLD_TILE_HEIGHT * TILE_SIZE;

export const WALL_COLOR = 0x3a2f4d;
export const CORRIDOR_FLOOR_COLOR = 0x241c33;

// Visual-only: how tall a wall's cosmetic face rises above its footprint.
// Purely cosmetic — computeWallRects() still defines collision, unaffected.
export const WALL_HEIGHT_PX = 26;

// Front door: a gap in the north world border, aligned with Entry's own
// corridor door so the two line up visually.
export const EXTERIOR_DOOR = { x: 5, length: 3 };
