import * as Phaser from "phaser";
import { TILE_SIZE, WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import type { InputSource } from "@/game/types/input";
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
const PLAYER_SPEED = 56; // logical px/sec

const IDLE_BOB_TIME_SCALE = 1;
const WALK_BOB_TIME_SCALE = 3;

const SKIN_COLOR = 0xe8b98c;
const HAIR_COLOR = 0x3a2a1e;
const SHIRT_COLOR = 0x6f5c9e;
const LEGS_COLOR = 0x2b2340;
const EYE_COLOR = 0x1c1626;

const FACINGS: Facing[] = ["down", "up", "left", "right"];

function textureKey(facing: Facing): string {
  return `mimi-${facing}`;
}

/** Diagonal movement reports vertical facing (deterministic tie-break). */
function facingFromDelta(dx: number, dy: number): Facing {
  if (dy !== 0) return dy < 0 ? "up" : "down";
  return dx < 0 ? "left" : "right";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
 * Mimi, the player character. Owns her sprite, movement, facing, and animation.
 * Collision belongs to a later phase; input source is swappable (keyboard now).
 */
export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;
  private state: PlayerState;
  private x: number;
  private y: number;
  private readonly input: InputSource;
  private readonly bob = { offset: 0 };
  private readonly bobTween: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number, input?: InputSource) {
    for (const facing of FACINGS) generateFacingTexture(scene, facing);

    this.state = { facing: "down", animationState: "idle" };
    this.x = x;
    this.y = y;
    this.input = input ?? new KeyboardInput(scene);

    this.sprite = scene.add.sprite(x, y, textureKey(this.state.facing));
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(PLAYER_DEPTH);

    this.bobTween = scene.tweens.add({
      targets: this.bob,
      offset: -1,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  update(delta: number): void {
    const intent = this.input.getIntent();
    let dx = 0;
    let dy = 0;
    if (intent.up) dy -= 1;
    if (intent.down) dy += 1;
    if (intent.left) dx -= 1;
    if (intent.right) dx += 1;

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const length = Math.hypot(dx, dy);
      const distance = PLAYER_SPEED * (delta / 1000);
      const stepX = (dx / length) * distance;
      const stepY = (dy / length) * distance;

      this.x = clamp(this.x + stepX, PLAYER_WIDTH / 2, WORLD_PIXEL_WIDTH - PLAYER_WIDTH / 2);
      this.y = clamp(this.y + stepY, PLAYER_HEIGHT, WORLD_PIXEL_HEIGHT);
      this.setFacing(facingFromDelta(dx, dy));
    }
    this.setAnimationState(moving ? "walking" : "idle");

    this.sprite.setPosition(this.x, this.y + this.bob.offset);
  }

  setFacing(facing: Facing): void {
    if (this.state.facing === facing) return;
    this.state = { ...this.state, facing };
    this.sprite.setTexture(textureKey(facing));
  }

  setAnimationState(animationState: PlayerState["animationState"]): void {
    if (this.state.animationState === animationState) return;
    this.state = { ...this.state, animationState };
    this.bobTween.timeScale = animationState === "walking" ? WALK_BOB_TIME_SCALE : IDLE_BOB_TIME_SCALE;
  }

  getState(): PlayerState {
    return this.state;
  }
}
