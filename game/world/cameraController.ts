import * as Phaser from "phaser";
import type { ViewOrientation } from "@/game/world/projection";

const ROTATION_DURATION_MS = 550;

export const CAMERA_EVENTS = {
  RotateStart: "rotate-start",
  RotateComplete: "rotate-complete",
} as const;

export interface RotateStartPayload {
  from: ViewOrientation;
  to: ViewOrientation;
}

const NEXT: Record<ViewOrientation, ViewOrientation> = { 0: 1, 1: 2, 2: 3, 3: 0 };
const PREV: Record<ViewOrientation, ViewOrientation> = { 0: 3, 1: 0, 2: 1, 3: 2 };

/**
 * Owns the four-way camera orientation and the timing/easing of rotating
 * between them. Deliberately render-agnostic — it knows nothing about
 * Containers, Graphics, or the camera object itself; StudioScene reads
 * getTransition() every frame while isRotating() and does the actual scene
 * work (layer crossfade/slide, camera bounds/follow, player blend).
 */
export class CameraController extends Phaser.Events.EventEmitter {
  private orientation: ViewOrientation = 0;
  private rotating = false;
  private from: ViewOrientation = 0;
  private to: ViewOrientation = 0;
  private progress = 0;

  constructor(private readonly scene: Phaser.Scene) {
    super();
  }

  getOrientation(): ViewOrientation {
    return this.orientation;
  }

  isRotating(): boolean {
    return this.rotating;
  }

  /** Valid mid-rotation only: the eased 0..1 blend between `from` and `to`. */
  getTransition(): { from: ViewOrientation; to: ViewOrientation; t: number } {
    return { from: this.from, to: this.to, t: this.progress };
  }

  rotateLeft(): void {
    this.rotate(PREV[this.orientation]);
  }

  rotateRight(): void {
    this.rotate(NEXT[this.orientation]);
  }

  private rotate(to: ViewOrientation): void {
    if (this.rotating) return;

    const from = this.orientation;
    this.rotating = true;
    this.from = from;
    this.to = to;
    this.progress = 0;
    this.emit(CAMERA_EVENTS.RotateStart, { from, to } satisfies RotateStartPayload);

    const tweenTarget = { t: 0 };
    this.scene.tweens.add({
      targets: tweenTarget,
      t: 1,
      duration: ROTATION_DURATION_MS,
      ease: "Cubic.easeInOut",
      onUpdate: () => {
        this.progress = tweenTarget.t;
      },
      onComplete: () => {
        this.orientation = to;
        this.rotating = false;
        this.progress = 0;
        this.emit(CAMERA_EVENTS.RotateComplete, to);
      },
    });
  }
}
