export type Facing = "up" | "down" | "left" | "right";

export type AnimationState = "idle" | "walking";

export interface PlayerState {
  facing: Facing;
  animationState: AnimationState;
}
