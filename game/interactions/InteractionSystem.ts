import * as Phaser from "phaser";
import type { Interactable } from "@/game/types/interaction";

export const INTERACTION_EVENTS = {
  Prompt: "prompt",
  Open: "open",
} as const;

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
    const closest = this.findClosest(playerX, playerY);
    if (closest?.id !== this.current?.id) {
      this.current = closest;
      this.emit(INTERACTION_EVENTS.Prompt, closest);
    }

    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.interact();
    }
  }

  /** Programmatic trigger for the current closest interactable. Keyboard is only one caller — a future mobile button calls this too. */
  interact(): void {
    if (this.current) this.emit(INTERACTION_EVENTS.Open, this.current);
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
