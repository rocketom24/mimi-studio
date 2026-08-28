import * as Phaser from "phaser";
import { InteractionSystem, INTERACTION_EVENTS } from "@/game/interactions/InteractionSystem";
import type { Interactable } from "@/game/types/interaction";
import { createGameText, PROMPT_STYLE } from "@/game/ui/textStyles";
import { Player, PLAYER_HEIGHT } from "@/game/entities/Player";

const PROMPT_DEPTH = 20;
const PROMPT_GAP = 3;

/** Floating "[E] ..." label above Mimi whenever she's near an interactable. */
export class InteractionPrompt {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly text: Phaser.GameObjects.Text;
  private current: Interactable | null = null;

  constructor(scene: Phaser.Scene, system: InteractionSystem, player: Player) {
    this.scene = scene;
    this.player = player;
    this.text = createGameText(scene, 0, 0, "", PROMPT_STYLE)
      .setOrigin(0.5, 1)
      .setDepth(PROMPT_DEPTH)
      .setVisible(false);

    system.on(INTERACTION_EVENTS.Prompt, this.handlePromptChange, this);
  }

  /** Re-clamp to the camera view every frame: the camera keeps lerping toward the player after the prompt appears. */
  update(): void {
    if (this.current) this.reposition();
  }

  private handlePromptChange(interactable: Interactable | null): void {
    this.current = interactable;
    if (!interactable) {
      this.text.setVisible(false);
      return;
    }
    this.text.setText(interactable.prompt);
    this.text.setVisible(true);
    this.reposition();
  }

  /** Anchor above Mimi's head, but slide inward so the panel never runs off the camera edge. */
  private reposition(): void {
    if (!this.current) return;
    const view = this.scene.cameras.main.worldView;
    const halfWidth = this.text.displayWidth / 2;
    const x = Phaser.Math.Clamp(this.player.sprite.x, view.x + halfWidth, view.right - halfWidth);
    const y = this.player.sprite.y - PLAYER_HEIGHT - PROMPT_GAP;
    this.text.setPosition(Math.round(x), Math.round(y));
  }
}
