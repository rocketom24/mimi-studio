/**
 * Render-order depth for every layer in the studio, lowest first.
 *
 * Floor and prompts/labels stay at fixed bands. Everything that can occupy
 * the same visual row — walls, furniture, Mimi — shares one continuous
 * Y-sorted band via visualDepth() so a wall behind her draws behind her and
 * a wall in front (closer to the fixed camera) draws in front.
 */
export const DEPTH = {
  FLOOR: 0,
  DYNAMIC_BASE: 1000,
  // Above every wall/furniture/player depth (DYNAMIC_BASE + worldY, worldY
  // bounded by WORLD_PIXEL_HEIGHT) so labels and door/window decorations
  // never get covered by a tall wall block drawn just south of them.
  LABEL_BASE: 3000,
  PROMPT: 5000,
} as const;

/** Deterministic Y-sort depth: larger world Y (closer to the fixed camera) renders later, i.e. on top. */
export function visualDepth(worldY: number): number {
  return DEPTH.DYNAMIC_BASE + worldY;
}
