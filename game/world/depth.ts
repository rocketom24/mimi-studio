import { toViewSpace } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";

/**
 * Render-order depth for every layer in the studio, lowest first.
 *
 * Floor and prompts/labels stay at fixed bands. Everything that can occupy
 * the same visual row — walls, furniture, Mimi — shares one continuous
 * view-sorted band via visualDepth() so a wall behind her draws behind her
 * and a wall in front (closer to the camera) draws in front, regardless of
 * which of the four camera orientations is active.
 */
export const DEPTH = {
  FLOOR: 0,
  LABEL_BASE: 500,
  DYNAMIC_BASE: 1000,
  PROMPT: 5000,
} as const;

/** Deterministic view-sort depth: larger view-space Y (closer to the current camera) renders later, i.e. on top. */
export function visualDepth(worldX: number, worldY: number, orientation: ViewOrientation): number {
  return DEPTH.DYNAMIC_BASE + toViewSpace(worldX, worldY, orientation).y;
}
