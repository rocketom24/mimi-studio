import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import type { Facing, PlayerState } from "@/game/types/player";

export const PLAYER_WIDTH = 10;
export const PLAYER_HEIGHT = 16;

// Entry room floor, a few tiles up from the south door (tiles 5-7 @ row 15),
// clear of the mail shelf and mat furniture.
export const PLAYER_SPAWN_TILE_X = 7;
export const PLAYER_SPAWN_TILE_Y = 12;
export const PLAYER_SPAWN_X = PLAYER_SPAWN_TILE_X * TILE_SIZE + TILE_SIZE / 2;
export const PLAYER_SPAWN_Y = (PLAYER_SPAWN_TILE_Y + 1) * TILE_SIZE;

const PLAYER_DEPTH = 10;

const SKIN_COLOR = 0xe8b98c;
const HAIR_COLOR = 0x3a2a1e;
const SHIRT_COLOR = 0x6f5c9e;
const LEGS_COLOR = 0x2b2340;
const EYE_COLOR = 0x1c1626;

const FACINGS: Facing[] = ["down", "up", "left", "right"];

function textureKey(facing: Facing): string {
  return `mimi-${facing}`;
}

/** Draws the placeholder Mimi silhouette for one facing direction into its own texture. */
function generateFacingTexture(scene: Phaser.Scene, facing: Facing): void {
  const key = textureKey(facing);
  if (scene.textures.exists(key)) return;

  const g = scene.add.graphics();

  g.fillStyle(SHIRT_COLOR, 1);
  g.fillRect(2, 8, 6, 5);
  g.fillStyle(LEGS_COLOR, 1);
  g.fillRect(2, 13, 2, 3);
  g.fillRect(6, 13, 2, 3);

  g.fillStyle(SKIN_COLOR, 1);
  g.fillRect(2, 0, 6, 8);

  g.fillStyle(HAIR_COLOR, 1);
  if (facing === "down") {
    g.fillRect(2, 0, 6, 3);
    g.fillRect(2, 3, 1, 3);
    g.fillRect(7, 3, 1, 3);
    g.fillStyle(EYE_COLOR, 1);
    g.fillRect(3, 4, 1, 1);
    g.fillRect(6, 4, 1, 1);
  } else if (facing === "up") {
    g.fillRect(2, 0, 6, 8);
  } else if (facing === "left") {
    g.fillRect(2, 0, 6, 3);
    g.fillRect(5, 3, 3, 5);
    g.fillStyle(EYE_COLOR, 1);
    g.fillRect(2, 4, 1, 1);
  } else {
    g.fillRect(2, 0, 6, 3);
    g.fillRect(2, 3, 3, 5);
    g.fillStyle(EYE_COLOR, 1);
    g.fillRect(7, 4, 1, 1);
  }

  g.generateTexture(key, PLAYER_WIDTH, PLAYER_HEIGHT);
  g.destroy();
}

/**
 * Mimi, the player character. Owns her sprite, facing, and idle animation.
 * Movement, collision, and input belong to later phases.
 */
export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;
  private state: PlayerState;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    for (const facing of FACINGS) generateFacingTexture(scene, facing);

    this.state = { facing: "down", animationState: "idle" };

    this.sprite = scene.add.sprite(x, y, textureKey(this.state.facing));
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(PLAYER_DEPTH);

    scene.tweens.add({
      targets: this.sprite,
      y: y - 1,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  setFacing(facing: Facing): void {
    if (this.state.facing === facing) return;
    this.state = { ...this.state, facing };
    this.sprite.setTexture(textureKey(facing));
  }

  getState(): PlayerState {
    return this.state;
  }
}
