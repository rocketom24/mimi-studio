export const TILE_SIZE = 16;

// Single-floor house rebuilt off the reference dollhouse image at a fixed
// single camera angle (no rotation). Sized to fit ROOMS exactly — two
// adjacent rooms keep one empty tile of gap between them for wallSystem's
// zoneEdgeWalls to land both rooms' walls on the same shared tile (see
// rooms.ts) — plus the 1-tile border ring.
export const WORLD_TILE_WIDTH = 24;
export const WORLD_TILE_HEIGHT = 21;
export const WORLD_PIXEL_WIDTH = WORLD_TILE_WIDTH * TILE_SIZE;
export const WORLD_PIXEL_HEIGHT = WORLD_TILE_HEIGHT * TILE_SIZE;

// Warm greige/taupe interior wall color — sits between the canvas's outdoor
// cream (#e8d9bc, gameConfig.ts) and the oak floor so walls stay legible
// against both, while still reading warm enough to complement the honey-oak
// cabinets and dark walnut furniture instead of competing with a gray wall.
export const WALL_COLOR = 0xc7b48c;

// Single medium warm natural oak floor color shared by every non-grass room
// (see rooms.ts and floorSystem.ts) — one flat, smooth floor everywhere, no
// per-tile texture or grid.
export const FLOOR_COLOR = 0xb8814f;

// Visual-only: how tall a wall's cosmetic face rises above its footprint.
// Purely cosmetic — computeWallRects() still defines collision, unaffected.
export const WALL_HEIGHT_PX = 40;
