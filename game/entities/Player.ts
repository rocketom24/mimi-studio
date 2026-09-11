import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import type { InputSource } from "@/game/types/input";
import type { Facing, PlayerState } from "@/game/types/player";
import { advancePhase, approach, approachAngle, keyframeBlend } from "@/game/entities/walkCycle";
import { visualDepth } from "@/game/world/depth";
import { project, screenToWorldDelta } from "@/game/world/projection";
import { resolveFurnitureCollision, type Point } from "@/game/world/collisionShapes";

const SHEET1_KEY = "mimi-sheet1";
const SHEET2_KEY = "mimi-sheet2";
const SHEET1_PATH = "/assets/game/character/mimi-sheet-1.png";
const SHEET2_PATH = "/assets/game/character/mimi-sheet-2.png";

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

// Mimi's collision body is her FLOOR FOOTPRINT, in world px - a small square
// centred on her feet. World x/y is floor space in this dimetric projection
// (see projection.ts), so a sprite measurement taken in screen pixels means
// nothing here: sizing the body off the down-idle crop (as this used to,
// 108x232 source px scaled by 0.138) gave her a 13x21 world-px floor
// footprint - 0.8 x 1.3 tiles, over a tile deep - whose centre sat ~10px
// NORTH of where she was actually standing. That single offset is what let
// her walk into the front of every piece of furniture while a phantom strip
// behind each one blocked open floor.
//
// 10px is ~0.6 tile, comfortably narrower than the 2-tile (32px) doorways
// and close to how wide she reads on the floor.
const BODY_FOOTPRINT_PX = 10;

// Entrance floor (world tiles x8-13, y14-19), near the front door.
export const PLAYER_SPAWN_TILE_X = 10;
export const PLAYER_SPAWN_TILE_Y = 18;
export const PLAYER_SPAWN_X = PLAYER_SPAWN_TILE_X * TILE_SIZE + TILE_SIZE / 2;
export const PLAYER_SPAWN_Y = (PLAYER_SPAWN_TILE_Y + 1) * TILE_SIZE;

const PLAYER_SPEED = 65; // logical px/sec

// Velocity eases toward its target instead of snapping, so starts/stops carry
// a little weight. Rates are 1/sec exponential-approach constants (see
// walkCycle.approach) — decel is faster than accel so stopping still feels
// crisp rather than sliding to a halt.
const ACCEL_RATE = 22;
const DECEL_RATE = 28;

// One full 4-keyframe gait cycle (idle -> stride A -> idle -> stride B) plays
// out over this much actual world-space travel, tying the animation directly
// to how far Mimi has really moved instead of a fixed timer - the same
// distance covers the same cycle at any speed, so there's no sliding.
const STRIDE_LENGTH_PX = 34;

// When movement stops mid-stride, phase eases toward whichever neutral idle
// anchor (phase 0 or PI - both keyframe sets place idle at both) is nearer,
// instead of freezing mid-step or popping back instantly.
const IDLE_SETTLE_RATE = 7;

// 0..1 envelope that eases in when walking starts and back out when it stops,
// scaling the lean/weight-shift below so they fade in/out with the stride
// instead of snapping on and off with animationState.
const WALK_INTENSITY_RATE = 9;
const LEAN_MAX_RAD = Phaser.Math.DegToRad(3);
const SWAY_MAX_PX = 1.2;

const IDLE_BOB_TIME_SCALE = 1;
const WALK_BOB_TIME_SCALE = 3;

/** Diagonal movement reports vertical facing (deterministic tie-break). */
function facingFromDelta(dx: number, dy: number): Facing {
  if (dy !== 0) return dy < 0 ? "up" : "down";
  return dx < 0 ? "left" : "right";
}

/**
 * Applies resolveFurnitureCollision's result to the body: any position
 * correction it computed (de-penetration, see collisionShapes.ts) gets
 * translated straight onto body.x/y (Arcade's postUpdate() propagates that to
 * the visible sprite from prevFrame/position deltas, same as a normal physics
 * move), then the resolved velocity is set as usual.
 */
function resolveFurnitureCollisions(body: Phaser.Physics.Arcade.Body, vx: number, vy: number, dt: number, polygons: readonly Point[][]): void {
  const cx = body.center.x;
  const cy = body.center.y;
  const resolved = resolveFurnitureCollision(cx, cy, body.halfWidth, body.halfHeight, vx, vy, dt, polygons);

  const dx = resolved.x - cx;
  const dy = resolved.y - cy;
  if (dx !== 0 || dy !== 0) {
    body.x += dx;
    body.y += dy;
    body.updateCenter();
  }

  body.setVelocity(resolved.vx, resolved.vy);
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
}

interface FrameRef {
  key: string;
  frame: string | number;
}

/**
 * Each direction's walk cycle as 4 keyframes spaced evenly around one gait
 * phase (0, PI/2, PI, 3*PI/2): idle -> contact A -> idle -> contact B. Idle
 * appears twice - a real gait passes through a feet-together moment once per
 * step, not once per stride - so it reads as a false "reset to standing" if
 * only alternating between the two contact poses directly.
 *
 * Player hard-cuts between these (see applyPose) rather than crossfading -
 * alpha-blending idle against a contact pose with a very different arm/leg
 * position made the whole sprite visibly pulse in and out at every
 * transition (a fading double-exposure reads as a flash; an instant swap
 * reads as a normal animation frame, the same way it does in every
 * traditional sprite-sheet walk cycle). What actually fixes the original
 * "static PNG sliding" complaint is picking the keyframe from real
 * distance-locked phase (see Player.update) instead of a fixed timer, not
 * blending between the art.
 */
const FRAME_SETS: Record<"down" | "up" | "left", readonly [FrameRef, FrameRef, FrameRef, FrameRef]> = {
  down: [
    { key: DOWN_IDLE.key, frame: DOWN_IDLE.frame },
    { key: DOWN_STRIDE.key, frame: DOWN_STRIDE.frame },
    { key: DOWN_IDLE.key, frame: DOWN_IDLE.frame },
    { key: DOWN_STRIDE_B.key, frame: DOWN_STRIDE_B.frame },
  ],
  up: [
    { key: UP.key, frame: UP.frame },
    { key: UP_LEFT_SWING_KEY, frame: "__BASE" },
    { key: UP.key, frame: UP.frame },
    { key: UP_RIGHT_SWING_KEY, frame: "__BASE" },
  ],
  left: [
    { key: LEFT.key, frame: LEFT.frame },
    { key: LEFT_STRIDE_FWD_KEY, frame: "__BASE" },
    { key: LEFT.key, frame: LEFT.frame },
    { key: LEFT_STRIDE_BACK_KEY, frame: "__BASE" },
  ],
};

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
  /** Container holding the two crossfading pose layers — see applyPose(). The thing the camera follows and the thing actually drawn. */
  readonly visual: Phaser.GameObjects.Sprite;
  private readonly scale: number;
  private state: PlayerState;
  private readonly input: InputSource;
  private readonly bob = { offset: 0 };
  private readonly bobTween: Phaser.Tweens.Tween;

  /** Gait phase in radians, advanced by actual world-space distance moved (see STRIDE_LENGTH_PX) — never by a timer. */
  private phase = 0;
  /** 0..1, eases toward 1 while walking and 0 while idle; scales the lean/sway so they fade rather than snap. */
  private walkIntensity = 0;
  private lastWorldX: number;
  private lastWorldY: number;
  private moving = false;

  constructor(scene: Phaser.Scene, x: number, y: number, input?: InputSource) {
    ensureMimiFrames(scene);

    this.state = { facing: "down", animationState: "idle" };
    this.input = input ?? new KeyboardInput(scene);
    this.lastWorldX = x;
    this.lastWorldY = y;

    this.scale = PLAYER_HEIGHT / SCALE_REFERENCE_HEIGHT;

    this.sprite = scene.physics.add.sprite(x, y, DOWN_IDLE.key, DOWN_IDLE.frame);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setVisible(false);
    this.sprite.setScale(this.scale);

    // Body size/offset are declared in the sprite's own source pixels; Arcade
    // multiplies both by the sprite's scale to get world px (Body.updateBounds
    // / updateFromGameObject). Working back from BODY_FOOTPRINT_PX therefore
    // needs the /scale, and the offset is measured from the frame's display
    // origin (the feet, origin 0.5/1) so the resulting box lands centred on
    // them rather than somewhere up the sprite.
    const bodySource = Math.round(BODY_FOOTPRINT_PX / this.scale);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(bodySource, bodySource, false);
    body.setOffset(this.sprite.displayOriginX - bodySource / 2, this.sprite.displayOriginY - bodySource / 2);
    body.setCollideWorldBounds(true);

    this.visual = scene.add.sprite(x, y, DOWN_IDLE.key, DOWN_IDLE.frame);
    this.visual.setOrigin(0.5, 1);
    this.visual.setScale(this.scale);
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

  update(deltaMs: number, collisionPolygons: readonly Point[][] = []): void {
    const dt = deltaMs / 1000;
    const intent = this.input.getIntent();
    let screenDx = 0;
    let screenDy = 0;
    if (intent.up) screenDy -= 1;
    if (intent.down) screenDy += 1;
    if (intent.left) screenDx -= 1;
    if (intent.right) screenDx += 1;

    const moving = screenDx !== 0 || screenDy !== 0;
    this.moving = moving;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    let targetVx = 0;
    let targetVy = 0;
    if (moving) {
      const length = Math.hypot(screenDx, screenDy);
      const world = screenToWorldDelta(screenDx / length, screenDy / length);
      targetVx = world.x * PLAYER_SPEED;
      targetVy = world.y * PLAYER_SPEED;
      this.setFacing(facingFromDelta(screenDx, screenDy));
    }
    const rate = moving ? ACCEL_RATE : DECEL_RATE;
    const approachedVx = approach(body.velocity.x, targetVx, rate, dt);
    const approachedVy = approach(body.velocity.y, targetVy, rate, dt);
    resolveFurnitureCollisions(body, approachedVx, approachedVy, dt, collisionPolygons);
    this.setAnimationState(moving ? "walking" : "idle");

    const traveled = Math.hypot(this.sprite.x - this.lastWorldX, this.sprite.y - this.lastWorldY);
    this.lastWorldX = this.sprite.x;
    this.lastWorldY = this.sprite.y;
    if (moving && traveled > 0) {
      this.phase = advancePhase(this.phase, traveled, STRIDE_LENGTH_PX);
    } else {
      // Settle toward the nearer of phase 0 or PI (both are the neutral
      // feet-together pose in every FRAME_SETS entry) instead of freezing
      // mid-stride when a key is released.
      const nearestIdlePhase = Math.round(this.phase / Math.PI) * Math.PI;
      this.phase = approachAngle(this.phase, nearestIdlePhase % (Math.PI * 2), IDLE_SETTLE_RATE, dt);
    }
    this.walkIntensity = approach(this.walkIntensity, moving ? 1 : 0, WALK_INTENSITY_RATE, dt);

    this.applyPose();
    this.reprojectVisual();
  }

  /** Repositions the visual sprite from the physics-authoritative sprite position — no input/movement/physics. */
  reprojectVisual(): void {
    const projected = project(this.sprite.x, this.sprite.y);
    const sway = Math.sin(this.phase) * SWAY_MAX_PX * this.walkIntensity;
    this.visual.setPosition(projected.x + sway, projected.y + this.bob.offset);
    this.visual.setDepth(visualDepth(this.sprite.x, this.sprite.y));
  }

  /** True if the player had real movement intent (a direction key/touch held) as of the last update() — used by the camera to know when to resume following after a manual pan. */
  get isMoving(): boolean {
    return this.moving;
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
  }

  setAnimationState(animationState: PlayerState["animationState"]): void {
    if (this.state.animationState === animationState) return;
    this.state = { ...this.state, animationState };
    this.bobTween.timeScale = animationState === "walking" ? WALK_BOB_TIME_SCALE : IDLE_BOB_TIME_SCALE;
  }

  /**
   * Picks this frame's keyframe, mirroring, and walking lean/sway from the
   * current facing + gait phase. Runs every update regardless of
   * animationState so a stopped stride keeps easing toward neutral (see
   * IDLE_SETTLE_RATE) instead of freezing on its last frame.
   */
  private applyPose(): void {
    const facingKey = this.state.facing === "right" ? "left" : this.state.facing;
    const frames = FRAME_SETS[facingKey];
    const { fromIndex, toIndex, blend } = keyframeBlend(this.phase, frames.length);
    const nearest = frames[blend < 0.5 ? fromIndex : toIndex];
    this.visual.setTexture(nearest.key, nearest.frame);
    this.visual.setFlipX(this.state.facing === "right");
    this.visual.setRotation(Math.sin(this.phase) * LEAN_MAX_RAD * this.walkIntensity);
  }

  getState(): PlayerState {
    return this.state;
  }
}
