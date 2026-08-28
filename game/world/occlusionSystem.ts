import { toViewRect, toViewSpace } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";
import type { WallSegment } from "@/game/world/wallSystem";

const FRONT_WALL_ALPHA = 0.15;

/**
 * Fades any wall segment whose near (view-space) face sits between the
 * current camera and Mimi — horizontally within that segment's span, and
 * nearer the camera than her. Computed entirely in view space via the same
 * toViewSpace/toViewRect rotation every other system uses, so it needs no
 * per-orientation "which wall is the front wall" bookkeeping: whichever
 * side is currently facing the camera is whatever produces the largest
 * view-space Y for that segment. Call every frame with the active
 * orientation's segments.
 */
export function updateWallOcclusion(
  segments: readonly WallSegment[],
  playerWorldX: number,
  playerWorldY: number,
  orientation: ViewOrientation,
): void {
  const player = toViewSpace(playerWorldX, playerWorldY, orientation);
  for (const { rect, graphics } of segments) {
    const view = toViewRect(rect, orientation);
    const inSpan = player.x >= view.x && player.x < view.x + view.w;
    const nearerThanPlayer = player.y < view.y + view.h;
    graphics.setAlpha(inSpan && nearerThanPlayer ? FRONT_WALL_ALPHA : 1);
  }
}
