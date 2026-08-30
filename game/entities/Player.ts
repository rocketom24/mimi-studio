import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import type { InputSource } from "@/game/types/input";
import type { Facing, PlayerState } from "@/game/types/player";
import { visualDepth } from "@/game/world/depth";
import { project, screenToWorldDelta } from "@/game/world/projection";

// Sized so WALL_HEIGHT_PX (40, see config/world.ts) reads as a realistic
// ~2.1x her height for door proportions (wallSystem/doorSystem door leaves
// span the full wall height, no separate header geometry needed).
export const PLAYER_WIDTH = 12;
export const PLAYER_HEIGHT = 19;

// Compact body over her lower body/legs, excluding hair and head so those
// never snag on walls. Texture-local: shirt+legs span x[2,10) y[9,19).
const BODY_WIDTH = 8;
const BODY_HEIGHT = 10;
const BODY_OFFSET_X = 2;
const BODY_OFFSET_Y = 9;

// Entrance floor (world tiles x8-13, y14-19), near the front door.
export const PLAYER_SPAWN_TILE_X = 10;
export const PLAYER_SPAWN_TILE_Y = 18;
export const PLAYER_SPAWN_X = PLAYER_SPAWN_TILE_X * TILE_SIZE + TILE_SIZE / 2;
export const PLAYER_SPAWN_Y = (PLAYER_SPAWN_TILE_Y + 1) * TILE_SIZE;

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
  g.fillRect(2, 9, 8, 6);
  g.fillStyle(LEGS_COLOR, 1);
  g.fillRect(2, 15, 3, 4);
  g.fillRect(7, 15, 3, 4);

  g.fillStyle(SKIN_COLOR, 1);
  g.fillRect(2, 0, 8, 9);

  g.fillStyle(HAIR_COLOR, 1);
  if (facing === "down") {
    g.fillRect(2, 0, 8, 4);
    g.fillRect(2, 4, 1, 4);
    g.fillRect(9, 4, 1, 4);
    g.fillStyle(EYE_COLOR, 1);
    g.fillRect(4, 5, 1, 1);
    g.fillRect(7, 5, 1, 1);
  } else if (facing === "up") {
    g.fillRect(2, 0, 8, 9);
  } else if (facing === "left") {
    g.fillRect(2, 0, 8, 4);
    g.fillRect(6, 4, 4, 6);
    g.fillStyle(EYE_COLOR, 1);
    g.fillRect(2, 5, 1, 1);
  } else {
    g.fillRect(2, 0, 8, 4);
    g.fillRect(2, 4, 4, 6);
    g.fillStyle(EYE_COLOR, 1);
    g.fillRect(9, 5, 1, 1);
  }

  g.generateTexture(key, PLAYER_WIDTH, PLAYER_HEIGHT);
  g.destroy();
}

/**
 * Mimi, the player character. Owns her sprite, movement, facing, and animation.
 * Collision belongs to a later phase; input source is swappable (keyboard now).
 *
 * `sprite` is the Arcade physics body and stays purely logical — Phaser's
 * Body.preUpdate() resyncs itself FROM the game object's x/y every single
 * step, so mutating sprite.x/y for cosmetic reasons (projection, bob) would
 * feed straight back into the collision-authoritative position and corrupt
 * it. `visual` is a plain, non-physics sprite that mirrors sprite's texture
 * and is repositioned to the projected/bobbed screen position each frame —
 * that's the one the camera follows and the one actually drawn.
 */
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly visual: Phaser.GameObjects.Sprite;
  private state: PlayerState;
  private readonly input: InputSource;
  private readonly bob = { offset: 0 };
  private readonly bobTween: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number, input?: InputSource) {
    for (const facing of FACINGS) generateFacingTexture(scene, facing);

    this.state = { facing: "down", animationState: "idle" };
    this.input = input ?? new KeyboardInput(scene);

    this.sprite = scene.physics.add.sprite(x, y, textureKey(this.state.facing));
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setVisible(false);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(BODY_WIDTH, BODY_HEIGHT);
    body.setOffset(BODY_OFFSET_X, BODY_OFFSET_Y);
    body.setCollideWorldBounds(true);

    this.visual = scene.add.sprite(x, y, textureKey(this.state.facing));
    this.visual.setOrigin(0.5, 1);
    this.visual.setDepth(visualDepth(y));

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
    const intent = this.input.getIntent();
    let screenDx = 0;
    let screenDy = 0;
    if (intent.up) screenDy -= 1;
    if (intent.down) screenDy += 1;
    if (intent.left) screenDx -= 1;
    if (intent.right) screenDx += 1;

    const moving = screenDx !== 0 || screenDy !== 0;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (moving) {
      const length = Math.hypot(screenDx, screenDy);
      const world = screenToWorldDelta(screenDx / length, screenDy / length);
      body.setVelocity(world.x * PLAYER_SPEED, world.y * PLAYER_SPEED);
      this.setFacing(facingFromDelta(screenDx, screenDy));
    } else {
      body.setVelocity(0, 0);
    }
    this.setAnimationState(moving ? "walking" : "idle");

    this.reprojectVisual();
  }

  /** Repositions the visual sprite from the physics-authoritative sprite position — no input/movement/physics. */
  reprojectVisual(): void {
    const projected = project(this.sprite.x, this.sprite.y);
    this.visual.setPosition(projected.x, projected.y + this.bob.offset);
    this.visual.setDepth(visualDepth(this.sprite.y));
  }

  /** Logical world X — the physics-authoritative position, unprojected. Use for interaction checks and room lookups. */
  get worldX(): number {
    return this.sprite.x;
  }

  /** Logical world Y — the physics-authoritative position, unprojected. Use for interaction checks and room lookups. */
  get worldY(): number {
    return this.sprite.y;
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
    this.visual.setTexture(textureKey(facing));
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
