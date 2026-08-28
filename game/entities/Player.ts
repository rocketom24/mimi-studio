import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import type { InputSource } from "@/game/types/input";
import type { Facing, PlayerState } from "@/game/types/player";

export const PLAYER_WIDTH = 10;
export const PLAYER_HEIGHT = 16;

// Compact body over her lower body/legs, excluding hair and head so those
// never snag on walls. Texture-local: shirt+legs span x[2,8) y[8,16).
const BODY_WIDTH = 6;
const BODY_HEIGHT = 8;
const BODY_OFFSET_X = 2;
const BODY_OFFSET_Y = 8;

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
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private state: PlayerState;
  private readonly input: InputSource;
  private readonly bob = { offset: 0 };
  private appliedBob = 0;
  private readonly bobTween: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number, input?: InputSource) {
    for (const facing of FACINGS) generateFacingTexture(scene, facing);

    this.state = { facing: "down", animationState: "idle" };
    this.input = input ?? new KeyboardInput(scene);

    this.sprite = scene.physics.add.sprite(x, y, textureKey(this.state.facing));
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(PLAYER_DEPTH);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(BODY_WIDTH, BODY_HEIGHT);
    body.setOffset(BODY_OFFSET_X, BODY_OFFSET_Y);
    body.setCollideWorldBounds(true);

    this.bobTween = scene.tweens.add({
      targets: this.bob,
      offset: -1,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  update(): void {
    // Undo last frame's cosmetic bob before physics-derived position is used.
    this.sprite.y -= this.appliedBob;

    const intent = this.input.getIntent();
    let dx = 0;
    let dy = 0;
    if (intent.up) dy -= 1;
    if (intent.down) dy += 1;
    if (intent.left) dx -= 1;
    if (intent.right) dx += 1;

    const moving = dx !== 0 || dy !== 0;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (moving) {
      const length = Math.hypot(dx, dy);
      body.setVelocity((dx / length) * PLAYER_SPEED, (dy / length) * PLAYER_SPEED);
      this.setFacing(facingFromDelta(dx, dy));
    } else {
      body.setVelocity(0, 0);
    }
    this.setAnimationState(moving ? "walking" : "idle");

    this.appliedBob = this.bob.offset;
    this.sprite.y += this.appliedBob;
  }

  /** Zeroes velocity and returns to idle — used to freeze Mimi while a UI panel has input focus. */
  stop(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.setAnimationState("idle");
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
