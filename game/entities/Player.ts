import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import type { InputSource } from "@/game/types/input";
import type { Facing, PlayerState } from "@/game/types/player";
import { visualDepth } from "@/game/world/depth";
import { projectOriented, viewToWorldDelta } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";

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
    this.visual.setDepth(visualDepth(x, y, 0));

    this.bobTween = scene.tweens.add({
      targets: this.bob,
      offset: -1,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  update(orientation: ViewOrientation): void {
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
      const world = viewToWorldDelta(screenDx / length, screenDy / length, orientation);
      body.setVelocity(world.x * PLAYER_SPEED, world.y * PLAYER_SPEED);
      // Facing tracks the screen-space intent (what the visitor pressed), not the
      // rotated world direction — pressing screen-right must always show Mimi
      // facing screen-right, regardless of camera orientation.
      this.setFacing(facingFromDelta(screenDx, screenDy));
    } else {
      body.setVelocity(0, 0);
    }
    this.setAnimationState(moving ? "walking" : "idle");

    this.reprojectVisual(orientation);
  }

  /** Repositions the visual sprite for the given orientation only — no input/movement/physics. Used both by the normal per-frame update() and to snap the visual once a rotation finishes. */
  reprojectVisual(orientation: ViewOrientation): void {
    const projected = projectOriented(this.sprite.x, this.sprite.y, orientation);
    this.visual.setPosition(projected.x, projected.y + this.bob.offset);
    this.visual.setDepth(visualDepth(this.sprite.x, this.sprite.y, orientation));
  }

  /**
   * Mid-rotation only: blends the visual sprite's screen position/depth
   * between its old- and new-orientation projections of the SAME logical
   * point (sprite.x/y never changes) so Mimi turns smoothly with the
   * apartment instead of snapping once the camera settles.
   */
  blendVisual(fromOrientation: ViewOrientation, toOrientation: ViewOrientation, t: number): void {
    const a = projectOriented(this.sprite.x, this.sprite.y, fromOrientation);
    const b = projectOriented(this.sprite.x, this.sprite.y, toOrientation);
    this.visual.setPosition(Phaser.Math.Linear(a.x, b.x, t), Phaser.Math.Linear(a.y, b.y, t) + this.bob.offset);
    const depthA = visualDepth(this.sprite.x, this.sprite.y, fromOrientation);
    const depthB = visualDepth(this.sprite.x, this.sprite.y, toOrientation);
    this.visual.setDepth(Phaser.Math.Linear(depthA, depthB, t));
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
