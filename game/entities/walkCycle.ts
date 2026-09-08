/**
 * Pure walk-cycle math, no Phaser dependency. Phase is tied to distance
 * actually moved (not a timer), so a leg's swing always matches how fast
 * Mimi is really moving on screen — no separate "did the animation keep up
 * with movement" bookkeeping, and no sliding by construction.
 */

const TWO_PI = Math.PI * 2;

/** Advances a gait phase (radians) by however much of a stride the given distance covers, wrapped into [0, 2*PI). */
export function advancePhase(phase: number, distanceMoved: number, strideLength: number): number {
  const next = phase + (distanceMoved / strideLength) * TWO_PI;
  return ((next % TWO_PI) + TWO_PI) % TWO_PI;
}

export interface KeyframeBlend {
  fromIndex: number;
  toIndex: number;
  /** 0 = fully `fromIndex`, 1 = fully `toIndex`. */
  blend: number;
}

/** Maps a gait phase onto a pair of adjacent keyframes (out of `frameCount` evenly spaced around the cycle) plus how far between them it sits. */
export function keyframeBlend(phase: number, frameCount: number): KeyframeBlend {
  const t = (phase / TWO_PI) * frameCount;
  const fromIndex = Math.floor(t) % frameCount;
  const toIndex = (fromIndex + 1) % frameCount;
  return { fromIndex, toIndex, blend: t - Math.floor(t) };
}

/** Frame-rate-independent exponential approach of `current` toward `target` — the standard smoothing used for both velocity easing and phase settling below. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Same as `approach`, but for an angle in radians — takes the shorter way around the wrap instead of the long way. */
export function approachAngle(current: number, target: number, rate: number, dt: number): number {
  const shortestDelta = ((target - current + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  return current + shortestDelta * (1 - Math.exp(-rate * dt));
}
