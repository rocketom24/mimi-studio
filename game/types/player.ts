export type Facing = "up" | "down" | "left" | "right";

export type AnimationState = "idle";

export interface PlayerState {
  facing: Facing;
  animationState: AnimationState;
}
