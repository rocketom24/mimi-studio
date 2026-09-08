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

/**
 * Deterministic depth-sort key: larger (closer to the fixed camera) renders
 * later, i.e. on top. Matches projection.ts's screenY = (worldX + worldY) *
 * ISO_Y_SCALE exactly (any monotonic function of worldX + worldY works as a
 * sort key, so the scale itself is dropped) — worldY alone was only a
 * correct proxy for screen depth for objects sharing similar worldX. Two
 * rooms side by side (e.g. Living Room and Bedroom + Study, same Y band,
 * different X) can each have furniture near their own back wall (small
 * worldY) that still needs to out-draw a shallower object in the other room
 * once worldX is factored in.
 */
export function visualDepth(worldX: number, worldY: number): number {
  return DEPTH.DYNAMIC_BASE + worldX + worldY;
}
