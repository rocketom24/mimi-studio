import type { WallSegment } from "@/game/world/wallSystem";

const FRONT_WALL_ALPHA = 0.15;

/**
 * Fades any wall segment whose near face sits between the fixed camera and
 * Mimi — horizontally within that segment's span, and nearer the camera
 * (larger world Y) than her.
 */
export function updateWallOcclusion(segments: readonly WallSegment[], playerWorldX: number, playerWorldY: number): void {
  for (const { rect, graphics } of segments) {
    const inSpan = playerWorldX >= rect.x && playerWorldX < rect.x + rect.w;
    const nearerThanPlayer = playerWorldY < rect.y + rect.h;
    graphics.setAlpha(inSpan && nearerThanPlayer ? FRONT_WALL_ALPHA : 1);
  }
}
