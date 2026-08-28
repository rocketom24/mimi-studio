import * as Phaser from "phaser";
import { InteractionSystem, INTERACTION_EVENTS } from "@/game/interactions/InteractionSystem";
import type { Interactable } from "@/game/types/interaction";
import { createGameText, PROMPT_STYLE } from "@/game/ui/textStyles";
import { Player, PLAYER_HEIGHT } from "@/game/entities/Player";
import { DEPTH } from "@/game/world/depth";
import { PALETTE } from "@/game/world/palette";

const PROMPT_GAP = 3;
const BORDER_PAD = 1;

/** Floating "[E] ..." label above Mimi whenever she's near an interactable. */
export class InteractionPrompt {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly text: Phaser.GameObjects.Text;
  private readonly border: Phaser.GameObjects.Graphics;
  private current: Interactable | null = null;

  constructor(scene: Phaser.Scene, system: InteractionSystem, player: Player) {
    this.scene = scene;
    this.player = player;
    this.border = scene.add.graphics().setDepth(DEPTH.PROMPT).setVisible(false);
    this.text = createGameText(scene, 0, 0, "", PROMPT_STYLE)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.PROMPT + 1)
      .setVisible(false);

    system.on(INTERACTION_EVENTS.Prompt, this.handlePromptChange, this);
  }

  /** Re-clamp to the camera view every frame: the camera keeps lerping toward the player after the prompt appears. */
  update(): void {
    if (this.current) this.reposition();
  }

  /** Hides the prompt during camera rotation without losing track of the current interactable, so it can reappear afterward without waiting for it to change. */
  setHidden(hidden: boolean): void {
    if (hidden) {
      this.text.setVisible(false);
      this.border.setVisible(false);
    } else if (this.current) {
      this.text.setVisible(true);
      this.border.setVisible(true);
      this.reposition();
    }
  }

  private handlePromptChange(interactable: Interactable | null): void {
    this.current = interactable;
    if (!interactable) {
      this.text.setVisible(false);
      this.border.setVisible(false);
      return;
    }
    this.text.setText(interactable.prompt);
    this.text.setVisible(true);
    this.border.setVisible(true);
    this.reposition();
  }

  /** Anchor above Mimi's head, but slide inward so the panel never runs off the camera edge. */
  private reposition(): void {
    if (!this.current) return;
    const view = this.scene.cameras.main.worldView;
    const halfWidth = this.text.displayWidth / 2;
    const x = Phaser.Math.Clamp(this.player.visual.x, view.x + halfWidth, view.right - halfWidth);
    const y = this.player.visual.y - PLAYER_HEIGHT - PROMPT_GAP;
    this.text.setPosition(Math.round(x), Math.round(y));
    this.drawBorder();
  }

  /** Subtle high-contrast border around the text's backing box. */
  private drawBorder(): void {
    const bounds = this.text.getBounds();
    this.border.clear();
    this.border.lineStyle(1, PALETTE.cream, 0.5);
    this.border.strokeRect(
      Math.round(bounds.x) - BORDER_PAD,
      Math.round(bounds.y) - BORDER_PAD,
      Math.round(bounds.width) + BORDER_PAD * 2,
      Math.round(bounds.height) + BORDER_PAD * 2,
    );
  }
}
