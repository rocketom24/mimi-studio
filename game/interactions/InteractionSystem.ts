import * as Phaser from "phaser";
import type { Interactable } from "@/game/types/interaction";

export const INTERACTION_EVENTS = {
  Prompt: "prompt",
  Open: "open",
} as const;

/** Extra px beyond an interactable's own radius before its prompt drops — keeps the prompt from flickering when Mimi idles right at the edge. */
const EXIT_RADIUS_MARGIN = 6;

/**
 * Tracks which interactable Mimi is closest to and fires the E-key interaction.
 * Knows nothing about portfolio content — interactables are opaque data with a panelId.
 */
export class InteractionSystem extends Phaser.Events.EventEmitter {
  private readonly eKey: Phaser.Input.Keyboard.Key;
  private readonly interactables: readonly Interactable[];
  private current: Interactable | null = null;

  constructor(scene: Phaser.Scene, interactables: readonly Interactable[]) {
    super();
    this.interactables = interactables;

    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error("Keyboard input plugin is not available");
    this.eKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  }

  update(playerX: number, playerY: number): void {
    const next = this.findClosest(playerX, playerY) ?? this.stickyCurrent(playerX, playerY);
    if (next?.id !== this.current?.id) {
      this.current = next;
      this.emit(INTERACTION_EVENTS.Prompt, next);
    }

    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.interact();
    }
  }

  /** Programmatic trigger for the current closest interactable. Keyboard is only one caller — a future mobile button calls this too. */
  interact(): void {
    if (this.current) this.emit(INTERACTION_EVENTS.Open, this.current);
  }

  /** Keeps the current prompt showing past its own radius, out to EXIT_RADIUS_MARGIN, so standing right at the edge doesn't flicker it off. */
  private stickyCurrent(playerX: number, playerY: number): Interactable | null {
    if (!this.current) return null;
    const dist = Phaser.Math.Distance.Between(playerX, playerY, this.current.x, this.current.y);
    return dist <= this.current.radius + EXIT_RADIUS_MARGIN ? this.current : null;
  }

  private findClosest(playerX: number, playerY: number): Interactable | null {
    let best: Interactable | null = null;
    let bestDist = Infinity;
    for (const interactable of this.interactables) {
      const dist = Phaser.Math.Distance.Between(playerX, playerY, interactable.x, interactable.y);
      if (dist <= interactable.radius && dist < bestDist) {
        best = interactable;
        bestDist = dist;
      }
    }
    return best;
  }
}
