import * as Phaser from "phaser";
import { Player, PLAYER_HEIGHT } from "@/game/entities/Player";
import { createGameText, DIALOGUE_STYLE } from "@/game/ui/textStyles";
import { DEPTH } from "@/game/world/depth";
import { PALETTE } from "@/game/world/palette";

const BUBBLE_GAP = 4;
const BORDER_PAD = 2;
const FADE_MS = 400;

/** One-shot speech bubble above Mimi on load — gone for good the moment she actually walks. */
export class GreetingBubble {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly text: Phaser.GameObjects.Text;
  private readonly border: Phaser.GameObjects.Graphics;
  private dismissed = false;

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene = scene;
    this.player = player;
    this.border = scene.add.graphics().setDepth(DEPTH.PROMPT).setAlpha(0);
    this.text = createGameText(scene, 0, 0, "Hola! I'm Mimi, let's explore my world!", DIALOGUE_STYLE)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.PROMPT + 1)
      .setScale(0.85)
      .setAlpha(0);
    this.reposition();
    scene.tweens.add({ targets: this.text, scale: 1, alpha: 1, duration: 220, ease: "Back.easeOut" });
    scene.tweens.add({ targets: this.border, alpha: 1, duration: 220 });
  }

  /** Re-clamp to the camera view every frame, same as InteractionPrompt — the camera keeps lerping toward Mimi right after spawn. */
  update(): void {
    if (this.dismissed) return;
    if (this.player.isMoving) {
      this.dismiss();
      return;
    }
    this.reposition();
  }

  private dismiss(): void {
    this.dismissed = true;
    this.scene.tweens.add({
      targets: this.text,
      scale: 0.85,
      alpha: 0,
      duration: FADE_MS,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.text.destroy();
        this.border.destroy();
      },
    });
    this.scene.tweens.add({ targets: this.border, alpha: 0, duration: FADE_MS, ease: "Quad.easeIn" });
  }

  private reposition(): void {
    const view = this.scene.cameras.main.worldView;
    const halfWidth = this.text.displayWidth / 2;
    const x = Phaser.Math.Clamp(this.player.visual.x, view.x + halfWidth, view.right - halfWidth);
    const y = this.player.visual.y - PLAYER_HEIGHT - BUBBLE_GAP;
    this.text.setPosition(Math.round(x), Math.round(y));
    this.drawBorder();
  }

  private drawBorder(): void {
    const bounds = this.text.getBounds();
    this.border.clear();
    this.border.lineStyle(1, PALETTE.cream, 0.6);
    this.border.strokeRect(
      Math.round(bounds.x) - BORDER_PAD,
      Math.round(bounds.y) - BORDER_PAD,
      Math.round(bounds.width) + BORDER_PAD * 2,
      Math.round(bounds.height) + BORDER_PAD * 2,
    );
  }
}
