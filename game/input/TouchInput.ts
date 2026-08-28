import type { InputSource, MovementIntent } from "@/game/types/input";

type Direction = keyof MovementIntent;

/** Movement intent driven by on-screen D-pad presses. React writes via setDirection(); Player reads getIntent() each frame, same as KeyboardInput. */
export class TouchInput implements InputSource {
  private readonly active: MovementIntent = { up: false, down: false, left: false, right: false };

  setDirection(direction: Direction, pressed: boolean): void {
    this.active[direction] = pressed;
  }

  /** Zeroes all directions — used when a portfolio panel opens so a stuck touch can't carry over. */
  clear(): void {
    this.active.up = false;
    this.active.down = false;
    this.active.left = false;
    this.active.right = false;
  }

  getIntent(): MovementIntent {
    return { ...this.active };
  }
}
