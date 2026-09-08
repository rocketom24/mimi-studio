import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import type { InputSource } from "@/game/types/input";
import type { Facing, PlayerState } from "@/game/types/player";
import { visualDepth } from "@/game/world/depth";
import { project, screenToWorldDelta } from "@/game/world/projection";

const SHEET1_KEY = "mimi-sheet1";
const SHEET2_KEY = "mimi-sheet2";
const SHEET1_PATH = "/assets/game/character/mimi-sheet-1.png";
const SHEET2_PATH = "/assets/game/character/mimi-sheet-2.png";
const WALK_DOWN_ANIM = "mimi-walk-down";
const WALK_UP_ANIM = "mimi-walk-up";
const WALK_LEFT_ANIM = "mimi-walk-left";

const UP_LEFT_SWING_KEY = "mimi-up-left-swing";
const UP_RIGHT_SWING_KEY = "mimi-up-right-swing";
const LEFT_STRIDE_FWD_KEY = "mimi-left-stride-fwd";
const LEFT_STRIDE_BACK_KEY = "mimi-left-stride-back";

/**
 * Frame rects below were located automatically (alpha-bounding-box scan of
 * both source sheets via a one-off script), not hand-cropped. Sheet 1 is a
 * loosely-captioned pose sheet whose text labels turned out unreliable on
 * inspection; the frames actually used were picked by eye from the real
 * poses. It turns out to contain two distinct real front-facing stride
 * poses (opposite leg/arm swing) - down's walk cycle uses both, no
 * synthetic mirroring needed. Sheet 2 is a rotation turntable (front ->
 * left-profile -> back), and every angle - checked across all 3 rows - is
 * the exact same standing pose with zero leg variation, so up/left have no
 * real stride art at all. Their walk cycles instead reuse the idle pose's
 * own real foot/leg pixels, cut out and rigidly translated (no skew/warp)
 * to a shifted position on a canvas texture - the same category of
 * operation as a mirrored flip, just a reposition instead. "right" has no
 * native art and mirrors "left" via flipX.
 */
const DOWN_IDLE = { key: SHEET1_KEY, frame: "down-idle", x: 292, y: 24, width: 90, height: 225 };
const DOWN_STRIDE = { key: SHEET1_KEY, frame: "down-stride", x: 957, y: 24, width: 78, height: 232 };
const DOWN_STRIDE_B = { key: SHEET1_KEY, frame: "down-stride-b", x: 61, y: 290, width: 106, height: 217 };
const UP = { key: SHEET2_KEY, frame: "up", x: 1229, y: 261, width: 95, height: 231 };
const LEFT = { key: SHEET2_KEY, frame: "left", x: 174, y: 262, width: 70, height: 234 };

// Real-pixel piece cut from the idle frame's own art for the rigid-shift
// walk trick (see comment above). Rects are local to their owning frame.
const UP_LEFT_FOOT_PIECE = { sx: 0, sy: 148, sw: 51, sh: 83, dx: 6, dy: -13 };
const UP_RIGHT_FOOT_PIECE = { sx: 50, sy: 148, sw: 45, sh: 83, dx: -6, dy: -13 };
const LEFT_LEG_PIECE_FWD = { sx: 5, sy: 154, sw: 45, sh: 80, dx: -19, dy: -9 };
const LEFT_LEG_PIECE_BACK = { sx: 5, sy: 154, sw: 45, sh: 80, dx: 15, dy: 5 };

// Content bbox height varies per pose (~217-234px) since a mid-stride pose
// is naturally a bit shorter/taller than standing idle - expected, not a
// bug. Scale is pinned to a fixed reference (down-idle's original 232px
// height) rather than derived from whichever frame is current, so overall
// character scale never drifts as poses change.
const SCALE_REFERENCE_HEIGHT = 232;
export const PLAYER_HEIGHT = 32;

// Collision body is sized off the original down-idle crop (108x232), fixed
// independently of whichever art the idle texture points at, so swapping
// the idle pose never resizes/repositions the hitbox.
const BODY_REFERENCE_WIDTH = 108;
const BODY_REFERENCE_HEIGHT = 232;

// Body hitbox as fractions of the down-idle frame (the canonical pose used
// to size the physics body): hair/face ends and the sweater collar starts
// ~33% down, and the sweater/arms are already the widest thing in the crop
// so the box only needs a small side margin. The hitbox does not change
// with facing/animation - only the visual sprite's frame does.
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

/** Loads Mimi's sprite sheets. Call once from the scene's preload(). */
export function preloadPlayerSprite(scene: Phaser.Scene): void {
  scene.load.image(SHEET1_KEY, SHEET1_PATH);
  scene.load.image(SHEET2_KEY, SHEET2_PATH);
}

/**
 * Builds a canvas texture that is the given base frame with one real-pixel
 * piece of its own art cut out and redrawn at a shifted position (rigid
 * translation only - no scale/skew/rotation applied to the piece). Used to
 * fake a leg mid-step from art that only has a single standing pose.
 */
function buildShiftedFrameTexture(
  scene: Phaser.Scene,
  key: string,
  base: { key: string; x: number; y: number; width: number; height: number },
  piece: { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number },
): void {
  if (scene.textures.exists(key)) return;
  const source = scene.textures.get(base.key).getSourceImage() as HTMLImageElement;
  const canvasTexture = scene.textures.createCanvas(key, base.width, base.height);
  if (!canvasTexture) return;
  const ctx = canvasTexture.context;
  ctx.drawImage(source, base.x, base.y, base.width, base.height, 0, 0, base.width, base.height);

  // No clearRect at the piece's original spot: erasing it left a transparent
  // notch wherever the shift didn't fully cover that area (e.g. a vertical
  // lift exposes a sliver at the old foot's bottom edge), reading as a leg
  // detached from the body. Leaving the untouched base pixels there and
  // drawing the shifted piece on top keeps the limb visually continuous.
  //
  // A plain opaque paste still reads as a floating rectangle though - its
  // straight-cut edges don't follow the leg's taper, so a corner pokes out
  // past the real silhouette wherever the piece is wider than the limb at
  // that point. Feathering the piece's own alpha (blurred inset mask) before
  // pasting fades those edges into the untouched base instead of cutting a
  // hard seam.
  const feather = Math.round(Math.min(piece.sw, piece.sh) * 0.25);
  const pieceCanvas = document.createElement("canvas");
  pieceCanvas.width = piece.sw;
  pieceCanvas.height = piece.sh;
  const pieceCtx = pieceCanvas.getContext("2d")!;
  pieceCtx.drawImage(source, base.x + piece.sx, base.y + piece.sy, piece.sw, piece.sh, 0, 0, piece.sw, piece.sh);
  pieceCtx.globalCompositeOperation = "destination-in";
  pieceCtx.filter = `blur(${feather}px)`;
  pieceCtx.fillStyle = "#000";
  pieceCtx.fillRect(feather, feather, piece.sw - feather * 2, piece.sh - feather * 2);

  ctx.drawImage(pieceCanvas, piece.sx + piece.dx, piece.sy + piece.dy);
  canvasTexture.refresh();
}

/**
 * Registers Mimi's custom texture frames, the rigid-shift walk frames, and
 * the walk animations, once per scene. Idempotent (guarded by existence
 * checks) so multiple Player instances / scene restarts are safe.
 */
function ensureMimiFrames(scene: Phaser.Scene): void {
  const sheet1 = scene.textures.get(SHEET1_KEY);
  const sheet2 = scene.textures.get(SHEET2_KEY);

  if (!sheet1.has(DOWN_IDLE.frame)) {
    sheet1.add(DOWN_IDLE.frame, 0, DOWN_IDLE.x, DOWN_IDLE.y, DOWN_IDLE.width, DOWN_IDLE.height);
  }
  if (!sheet1.has(DOWN_STRIDE.frame)) {
    sheet1.add(DOWN_STRIDE.frame, 0, DOWN_STRIDE.x, DOWN_STRIDE.y, DOWN_STRIDE.width, DOWN_STRIDE.height);
  }
  if (!sheet1.has(DOWN_STRIDE_B.frame)) {
    sheet1.add(DOWN_STRIDE_B.frame, 0, DOWN_STRIDE_B.x, DOWN_STRIDE_B.y, DOWN_STRIDE_B.width, DOWN_STRIDE_B.height);
  }
  if (!sheet2.has(UP.frame)) {
    sheet2.add(UP.frame, 0, UP.x, UP.y, UP.width, UP.height);
  }
  if (!sheet2.has(LEFT.frame)) {
    sheet2.add(LEFT.frame, 0, LEFT.x, LEFT.y, LEFT.width, LEFT.height);
  }

  buildShiftedFrameTexture(scene, UP_LEFT_SWING_KEY, UP, UP_LEFT_FOOT_PIECE);
  buildShiftedFrameTexture(scene, UP_RIGHT_SWING_KEY, UP, UP_RIGHT_FOOT_PIECE);
  buildShiftedFrameTexture(scene, LEFT_STRIDE_FWD_KEY, LEFT, LEFT_LEG_PIECE_FWD);
  buildShiftedFrameTexture(scene, LEFT_STRIDE_BACK_KEY, LEFT, LEFT_LEG_PIECE_BACK);

  // Every cycle below alternates a real contact/stride pose with the
  // standing idle pose (there's no real "passing" mid-stride art). Giving
  // both an equal share of the cycle (the old flat frameRate: 8) makes the
  // legs visibly reset to a neutral together-stance for half of every step
  // while the body keeps translating - reads as gliding/sliding rather than
  // walking. Real gait spends most of a step's time with weight on the
  // planted/contact leg and only a brief instant with feet passing under the
  // body, so holding the stride frames longer and flashing the idle frame
  // briefly reads as a foot actually planting each step. Total cycle time
  // (500ms) is unchanged from the old 4 * 125ms, so this doesn't affect how
  // far she travels per step - only how that same time is distributed.
  const STRIDE_FRAME_MS = 180;
  const PASSING_FRAME_MS = 70;

  if (!scene.anims.exists(WALK_DOWN_ANIM)) {
    scene.anims.create({
      key: WALK_DOWN_ANIM,
      frames: [
        { key: DOWN_IDLE.key, frame: DOWN_IDLE.frame, duration: PASSING_FRAME_MS },
        { key: DOWN_STRIDE.key, frame: DOWN_STRIDE.frame, duration: STRIDE_FRAME_MS },
        { key: DOWN_IDLE.key, frame: DOWN_IDLE.frame, duration: PASSING_FRAME_MS },
        { key: DOWN_STRIDE_B.key, frame: DOWN_STRIDE_B.frame, duration: STRIDE_FRAME_MS },
      ],
      repeat: -1,
    });
  }

  if (!scene.anims.exists(WALK_UP_ANIM)) {
    scene.anims.create({
      key: WALK_UP_ANIM,
      frames: [
        { key: UP.key, frame: UP.frame, duration: PASSING_FRAME_MS },
        { key: UP_LEFT_SWING_KEY, frame: "__BASE", duration: STRIDE_FRAME_MS },
        { key: UP.key, frame: UP.frame, duration: PASSING_FRAME_MS },
        { key: UP_RIGHT_SWING_KEY, frame: "__BASE", duration: STRIDE_FRAME_MS },
      ],
      repeat: -1,
    });
  }

  if (!scene.anims.exists(WALK_LEFT_ANIM)) {
    scene.anims.create({
      key: WALK_LEFT_ANIM,
      frames: [
        { key: LEFT.key, frame: LEFT.frame, duration: PASSING_FRAME_MS },
        { key: LEFT_STRIDE_FWD_KEY, frame: "__BASE", duration: STRIDE_FRAME_MS },
        { key: LEFT.key, frame: LEFT.frame, duration: PASSING_FRAME_MS },
        { key: LEFT_STRIDE_BACK_KEY, frame: "__BASE", duration: STRIDE_FRAME_MS },
      ],
      repeat: -1,
    });
  }
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
    ensureMimiFrames(scene);

    this.state = { facing: "down", animationState: "idle" };
    this.input = input ?? new KeyboardInput(scene);

    const scale = PLAYER_HEIGHT / SCALE_REFERENCE_HEIGHT;
    const bodyOffsetX = Math.round(BODY_REFERENCE_WIDTH * BODY_SIDE_MARGIN_FRACTION);
    const bodyOffsetY = Math.round(BODY_REFERENCE_HEIGHT * BODY_TOP_FRACTION);
    const bodyWidth = Math.round(BODY_REFERENCE_WIDTH - 2 * bodyOffsetX);
    const bodyHeight = Math.round(BODY_REFERENCE_HEIGHT - bodyOffsetY);

    this.sprite = scene.physics.add.sprite(x, y, DOWN_IDLE.key, DOWN_IDLE.frame);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setVisible(false);
    this.sprite.setScale(scale);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(bodyWidth, bodyHeight);
    body.setOffset(bodyOffsetX, bodyOffsetY);
    body.setCollideWorldBounds(true);

    this.visual = scene.add.sprite(x, y, DOWN_IDLE.key, DOWN_IDLE.frame);
    this.visual.setOrigin(0.5, 1);
    this.visual.setScale(scale);
    this.visual.setDepth(visualDepth(x, y));

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
    this.visual.setDepth(visualDepth(this.sprite.x, this.sprite.y));
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
    this.applyVisualState();
  }

  setAnimationState(animationState: PlayerState["animationState"]): void {
    if (this.state.animationState === animationState) return;
    this.state = { ...this.state, animationState };
    this.bobTween.timeScale = animationState === "walking" ? WALK_BOB_TIME_SCALE : IDLE_BOB_TIME_SCALE;
    this.applyVisualState();
  }

  /**
   * Picks the visual sprite's texture/frame + walk-cycle animation for the
   * current facing + animation state. Every direction now has a real
   * 4-frame stride cycle (down: two real poses; up/left: idle art plus its
   * own rigid-shifted foot pieces — see ensureMimiFrames). "right" mirrors
   * "left" via flipX — there's no native right-facing art.
   */
  private applyVisualState(): void {
    const { facing, animationState } = this.state;
    const facingKey = facing === "right" ? "left" : facing;
    this.visual.setFlipX(facing === "right");

    const idle = facingKey === "down" ? DOWN_IDLE : facingKey === "up" ? UP : LEFT;
    const walkAnim = facingKey === "down" ? WALK_DOWN_ANIM : facingKey === "up" ? WALK_UP_ANIM : WALK_LEFT_ANIM;

    if (animationState === "walking") {
      if (this.visual.anims.getName() !== walkAnim) {
        this.visual.play(walkAnim);
      }
    } else {
      this.visual.anims.stop();
      this.visual.setTexture(idle.key, idle.frame);
    }
  }

  getState(): PlayerState {
    return this.state;
  }
}
