import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import type { InputSource } from "@/game/types/input";
import type { Facing, PlayerState } from "@/game/types/player";
import { visualDepth } from "@/game/world/depth";
import { project, screenToWorldDelta } from "@/game/world/projection";

const TEXTURE_KEY = "mimi";
const SPRITE_PATH = "/assets/game/character/mimi.png";

// The source PNG is trimmed to its alpha bounding box, so origin (0.5, 1)
// lands exactly on her feet. Target on-screen height in world px — about
// 0.8x WALL_HEIGHT_PX (40, see config/world.ts) so she reads at a believable
// scale next to doors/furniture; actual scale is derived from the loaded
// texture's native size at runtime below, whatever that native size is.
export const PLAYER_HEIGHT = 32;

// Body hitbox as fractions of the source image, measured off its alpha
// bounding box: hair/face ends and the sweater collar starts ~33% down, and
// the sweater/arms are already the widest thing in the crop so the box only
// needs a small side margin.
const BODY_TOP_FRACTION = 0.33;
const BODY_SIDE_MARGIN_FRACTION = 0.05;

// Entrance floor (world tiles x8-13, y14-19), near the front door.
export const PLAYER_SPAWN_TILE_X = 10;
export const PLAYER_SPAWN_TILE_Y = 18;
export const PLAYER_SPAWN_X = PLAYER_SPAWN_TILE_X * TILE_SIZE + TILE_SIZE / 2;
export const PLAYER_SPAWN_Y = (PLAYER_SPAWN_TILE_Y + 1) * TILE_SIZE;

const PLAYER_SPEED = 65; // logical px/sec

const IDLE_BOB_TIME_SCALE = 1;
const WALK_BOB_TIME_SCALE = 3;

/** Diagonal movement reports vertical facing (deterministic tie-break). */
function facingFromDelta(dx: number, dy: number): Facing {
  if (dy !== 0) return dy < 0 ? "up" : "down";
  return dx < 0 ? "left" : "right";
}

/** Loads Mimi's sprite. Call once from the scene's preload(). */
export function preloadPlayerSprite(scene: Phaser.Scene): void {
  scene.load.image(TEXTURE_KEY, SPRITE_PATH);
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
    this.state = { facing: "down", animationState: "idle" };
    this.input = input ?? new KeyboardInput(scene);

    const source = scene.textures.get(TEXTURE_KEY).getSourceImage();
    const scale = PLAYER_HEIGHT / source.height;
    const bodyOffsetX = Math.round(source.width * BODY_SIDE_MARGIN_FRACTION);
    const bodyOffsetY = Math.round(source.height * BODY_TOP_FRACTION);
    const bodyWidth = Math.round(source.width - 2 * bodyOffsetX);
    const bodyHeight = Math.round(source.height - bodyOffsetY);

    this.sprite = scene.physics.add.sprite(x, y, TEXTURE_KEY);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setVisible(false);
    this.sprite.setScale(scale);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(bodyWidth, bodyHeight);
    body.setOffset(bodyOffsetX, bodyOffsetY);
    body.setCollideWorldBounds(true);

    this.visual = scene.add.sprite(x, y, TEXTURE_KEY);
    this.visual.setOrigin(0.5, 1);
    this.visual.setScale(scale);
    this.visual.setDepth(visualDepth(y));
    this.visual.setFlipX(this.state.facing === "left");

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
    // ponytail: only one directional pose shipped (front-facing); mirrored
    // for left/right, reused as-is for up/down. Add real back/side art and
    // swap textures per facing if walking-away needs to look correct.
    this.visual.setFlipX(facing === "left");
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
