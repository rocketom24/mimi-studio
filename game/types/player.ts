/**
 * Screen-space compass facings, in clockwise order starting at east. The order
 * is load-bearing: Player quantises a continuous facing angle straight into
 * this array by dividing by 45 degrees, so rotating the list would rotate Mimi.
 */
export const FACINGS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"] as const;

export type Facing = (typeof FACINGS)[number];

export type AnimationState = "idle" | "walking";

export interface PlayerState {
  facing: Facing;
  animationState: AnimationState;
}
