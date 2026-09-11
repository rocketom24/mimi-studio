import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import type { InputSource } from "@/game/types/input";
import { FACINGS, type Facing, type PlayerState } from "@/game/types/player";
import { advancePhase, approach, approachAngle, keyframeBlend } from "@/game/entities/walkCycle";
import { visualDepth } from "@/game/world/depth";
import { project, screenToWorldDelta } from "@/game/world/projection";
import { resolveFurnitureCollision, type Point } from "@/game/world/collisionShapes";
import { ATLAS_ROW, MIMI_WALK_ATLAS, POSE, type AtlasDirection } from "@/game/entities/mimiWalkAtlas";

/**
 * Mimi's walk art is a generated, uniform-grid atlas — see
 * scripts/build-mimi-walk-atlas.mjs for how it is derived from the two raw
 * pose sheets. Two properties of that atlas are what this file relies on:
 *
 *  - every frame is the same size, so swapping frames can never move the
 *    sprite's display origin, and
 *  - every figure is positioned so its ground anchor (the point midway between
 *    the feet, on the floor line) sits at the same pixel in every cell.
 *
 * Together those mean pose changes cannot introduce any positional jitter, and
 * no per-frame origin bookkeeping is needed here at all.
 *
 * Only five of the eight directions are drawn. The three missing ones are the
 * horizontal mirror of a drawn one (w of e, sw of se, ne of nw) and are
 * produced with flipX — which stays aligned precisely because the anchor is
 * the horizontal centre of the cell, so a flip maps it onto itself.
 */
const MIRRORED: ReadonlySet<Facing> = new Set<Facing>(["w", "sw", "ne"]);
const ATLAS_DIRECTION: Record<Facing, AtlasDirection> = {
  e: "e",
  se: "se",
  s: "s",
  sw: "se",
  w: "e",
  nw: "nw",
  n: "n",
  ne: "nw",
};

export const PLAYER_HEIGHT = 32;

/**
 * Mimi's rendered standing height in screen px, carried over exactly from the
 * previous art so this change cannot resize her: that sheet's idle frame held
 * 225px of content and was drawn at 32/232, i.e. 31.03px tall on screen. The
 * sprite scale below is whatever makes the new atlas's standing pose match it.
 */
const RENDERED_STANDING_HEIGHT = 225 * (PLAYER_HEIGHT / 232);

// Mimi's collision body is her FLOOR FOOTPRINT, in world px - a small square
// centred on her feet. World x/y is floor space in this dimetric projection
// (see projection.ts), so a sprite measurement taken in screen pixels means
// nothing here: sizing the body off a sprite crop gives a footprint over a
// tile deep whose centre sits well north of where she is actually standing,
// which is what used to let her walk into the front of every piece of
// furniture while a phantom strip behind each one blocked open floor.
//
// 10px is ~0.6 tile, comfortably narrower than the 2-tile (32px) doorways
// and close to how wide she reads on the floor.
export const BODY_FOOTPRINT_PX = 10;

// Living room floor (world tiles x1-13, y1-12), clear of all furniture —
// was the entrance tile at the front door, which hid Mimi behind its leaf
// on load. This tile sits ~38px from the nearest piece (the dining table).
export const PLAYER_SPAWN_TILE_X = 7;
export const PLAYER_SPAWN_TILE_Y = 6;
export const PLAYER_SPAWN_X = PLAYER_SPAWN_TILE_X * TILE_SIZE + TILE_SIZE / 2;
export const PLAYER_SPAWN_Y = (PLAYER_SPAWN_TILE_Y + 1) * TILE_SIZE;

const PLAYER_SPEED = 85; // logical px/sec

// Velocity eases toward its target instead of snapping, so starts/stops carry
// a little weight. Rates are 1/sec exponential-approach constants (see
// walkCycle.approach) — decel is faster than accel so stopping still feels
// crisp rather than sliding to a halt.
const ACCEL_RATE = 22;
const DECEL_RATE = 28;

/**
 * One full 4-keyframe gait cycle (neutral -> contact A -> neutral -> contact B)
 * plays out over this much travel, measured in WORLD px — the floor she
 * actually crosses, not the screen distance that floor projects to.
 *
 * This distinction decides how the gait reads. The dimetric projection is
 * anisotropic: screenY is scaled by ISO_Y_SCALE, half of ISO_X_SCALE, so
 * walking "screen up" covers world ground at exactly the same rate as walking
 * "screen right" while advancing only ~0.5x as far in screen pixels. Clocking
 * the cycle off the projected position therefore halved her step rate whenever
 * she walked up or down the screen — she kept her real speed but her legs
 * moved in slow motion, and the gait visibly changed every time she turned.
 * Cadence is a property of how fast someone is walking, not of where the
 * camera is; the eye reads a cadence change far more strongly than it reads
 * imperfect foot planting. So: world distance.
 *
 * The two measures coincide for due east/west (the projected length of a
 * screen-horizontal unit move is ~0.99), which is why that axis looked right
 * under either rule and is unaffected by this value's meaning changing.
 *
 * On the number: the contact poses put her feet ~9px apart on screen, so
 * literal slip-free contact would want ~18. At the unchanged PLAYER_SPEED that
 * is ~7 steps/sec — frantic scurrying, not a cozy walk; she simply covers a lot
 * of ground for how tall she is. 30 holds ~4.3 steps/sec, the same ballpark as
 * the genre's 4-frames-at-8fps convention. Lower toward 18 for foot-accurate
 * contact, raise for a more ambling gait.
 */
const STRIDE_LENGTH_PX = 30;

// When movement stops mid-stride, phase eases toward whichever neutral anchor
// (phase 0 or PI - both are the feet-together pose) is nearer, instead of
// freezing mid-step or popping back instantly.
const IDLE_SETTLE_RATE = 7;

// Below this much travel in a frame she counts as not actually going anywhere,
// and the gait settles to neutral rather than holding whatever pose it was mid-
// way through. Without it, walking into furniture and keeping the key held left
// her frozen on a half-raised leg — intent was still "walking", so the cycle
// never settled, but she had no ground left to cover to advance it either.
// Sliding along a wall still covers real distance and still animates.
const BLOCKED_TRAVEL_EPSILON = 0.01;

/**
 * Facing is held as a continuous angle that chases the input direction, and is
 * only quantised to one of the eight sprites at draw time. A hard reversal
 * therefore sweeps through the intervening directions over ~150ms and reads as
 * Mimi turning around, instead of the sprite popping to its opposite. It also
 * absorbs the one-frame flicker you would otherwise get from releasing the two
 * keys of a diagonal a frame apart.
 */
const TURN_RATE = 16;

// 0..1 envelope that eases in when walking starts and back out when it stops.
// Used to fade the idle breathing bob out while she walks — the walk art
// carries its own weight shift, and layering an extra vertical offset on top
// would lift her planted foot off the floor.
const WALK_INTENSITY_RATE = 9;
const IDLE_BOB_PX = 1;

/** Screen-space angle (radians) of a facing, matching FACINGS' clockwise-from-east order. */
const SECTOR_RADIANS = (Math.PI * 2) / FACINGS.length;

/** Quantises a continuous screen-space angle to the nearest of the eight facings. */
function facingFromAngle(angle: number): Facing {
  const index = Math.round(angle / SECTOR_RADIANS);
  return FACINGS[((index % FACINGS.length) + FACINGS.length) % FACINGS.length];
}

/**
 * Each direction's cycle as 4 keyframes spaced evenly around one gait phase
 * (0, PI/2, PI, 3PI/2): neutral -> contact A -> neutral -> contact B. Neutral
 * appears twice because a real gait passes through a feet-together moment once
 * per step, not once per stride; alternating the two contacts directly reads as
 * a stiff shuffle.
 *
 * Frames are hard-cut, never crossfaded — alpha-blending two poses with
 * different limb positions reads as the whole sprite pulsing, whereas an
 * instant swap reads as a normal animation frame. What removes the "sliding
 * PNG" feel is that the keyframe is picked from real distance-locked phase
 * (see update), not from a timer.
 */
const CYCLE: readonly (typeof POSE)[keyof typeof POSE][] = [
  POSE.neutral,
  POSE.contactA,
  POSE.neutral,
  POSE.contactB,
];

/** Atlas frame index for a facing at a given slot in the cycle. */
function frameIndex(facing: Facing, cycleSlot: number): number {
  return ATLAS_ROW[ATLAS_DIRECTION[facing]] * MIMI_WALK_ATLAS.columns + CYCLE[cycleSlot];
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

/** Loads Mimi's walk atlas. Call once from the scene's preload(). */
export function preloadPlayerSprite(scene: Phaser.Scene): void {
  scene.load.spritesheet(MIMI_WALK_ATLAS.key, MIMI_WALK_ATLAS.path, {
    frameWidth: MIMI_WALK_ATLAS.frameWidth,
    frameHeight: MIMI_WALK_ATLAS.frameHeight,
  });
}

/**
 * Mimi, the player character. Owns her sprite, movement, facing, and animation.
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
  /** The thing the camera follows and the thing actually drawn. */
  readonly visual: Phaser.GameObjects.Sprite;
  private readonly scale: number;
  private state: PlayerState;
  private readonly input: InputSource;
  private readonly bob = { offset: 0 };
  private readonly bobTween: Phaser.Tweens.Tween;

  /** Gait phase in radians, advanced by actual world distance moved (see STRIDE_LENGTH_PX) — never by a timer. */
  private phase = 0;
  /** Continuous screen-space facing angle; quantised to a sprite only at draw time (see TURN_RATE). */
  private facingAngle = Math.PI / 2; // south, matching the initial "s" facing
  /** 0..1, eases toward 1 while walking and 0 while idle; fades the idle bob out. */
  private walkIntensity = 0;
  private lastWorldX: number;
  private lastWorldY: number;
  private moving = false;
  /** Frame currently shown, so setFrame is only called on a real change. */
  private currentFrame = -1;

  constructor(scene: Phaser.Scene, x: number, y: number, input?: InputSource) {
    this.state = { facing: "s", animationState: "idle" };
    this.input = input ?? new KeyboardInput(scene);

    this.lastWorldX = x;
    this.lastWorldY = y;

    this.scale = RENDERED_STANDING_HEIGHT / MIMI_WALK_ATLAS.referenceStandingHeight;

    // The atlas's ground anchor is the cell's bottom-centre less padBottom, so
    // that — not the cell's literal bottom edge — is where the origin goes.
    const originY = (MIMI_WALK_ATLAS.frameHeight - MIMI_WALK_ATLAS.padBottom) / MIMI_WALK_ATLAS.frameHeight;
    const startFrame = frameIndex("s", 0);

    this.sprite = scene.physics.add.sprite(x, y, MIMI_WALK_ATLAS.key, startFrame);
    this.sprite.setOrigin(0.5, originY);
    this.sprite.setVisible(false);
    this.sprite.setScale(this.scale);

    // Body size/offset are declared in the sprite's own source pixels; Arcade
    // multiplies both by the sprite's scale to get world px (Body.updateBounds
    // / updateFromGameObject). Working back from BODY_FOOTPRINT_PX therefore
    // needs the /scale, and the offset is measured from the frame's display
    // origin (the ground anchor) so the resulting box lands centred on her
    // feet rather than somewhere up the sprite.
    const bodySource = Math.round(BODY_FOOTPRINT_PX / this.scale);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(bodySource, bodySource, false);
    body.setOffset(this.sprite.displayOriginX - bodySource / 2, this.sprite.displayOriginY - bodySource / 2);
    body.setCollideWorldBounds(true);

    this.visual = scene.add.sprite(x, y, MIMI_WALK_ATLAS.key, startFrame);
    this.visual.setOrigin(0.5, originY);
    this.visual.setScale(this.scale);
    this.visual.setDepth(visualDepth(x, y));
    this.currentFrame = startFrame;

    this.bobTween = scene.tweens.add({
      targets: this.bob,
      offset: -IDLE_BOB_PX,
      duration: 1400,
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
      // Facing is driven by SCREEN intent, not the world-space velocity: the
      // sprites are drawn for screen directions, and pressing Right must show
      // her walking right regardless of how that shears into world space.
      this.facingAngle = approachAngle(this.facingAngle, Math.atan2(screenDy, screenDx), TURN_RATE, dt);
    }
    const rate = moving ? ACCEL_RATE : DECEL_RATE;
    const approachedVx = approach(body.velocity.x, targetVx, rate, dt);
    const approachedVy = approach(body.velocity.y, targetVy, rate, dt);
    resolveFurnitureCollisions(body, approachedVx, approachedVy, dt, collisionPolygons);
    this.setAnimationState(moving ? "walking" : "idle");
    this.setFacing(facingFromAngle(this.facingAngle));

    // Phase advances on the world ground she actually crossed — so her cadence
    // is identical in every direction, and being blocked by furniture stops the
    // legs rather than letting them run on the spot.
    const traveled = Math.hypot(this.sprite.x - this.lastWorldX, this.sprite.y - this.lastWorldY);
    this.lastWorldX = this.sprite.x;
    this.lastWorldY = this.sprite.y;
    if (moving && traveled > BLOCKED_TRAVEL_EPSILON) {
      this.phase = advancePhase(this.phase, traveled, STRIDE_LENGTH_PX);
    } else {
      // Settle toward the nearer of phase 0 or PI (both are the neutral
      // feet-together pose) instead of freezing mid-stride on key release.
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
    this.visual.setPosition(projected.x, projected.y + this.bob.offset * (1 - this.walkIntensity));
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
    this.moving = false;
    this.setAnimationState("idle");
  }

  setFacing(facing: Facing): void {
    if (this.state.facing === facing) return;
    this.state = { ...this.state, facing };
  }

  setAnimationState(animationState: PlayerState["animationState"]): void {
    if (this.state.animationState === animationState) return;
    this.state = { ...this.state, animationState };
  }

  /**
   * Picks this frame's atlas frame and mirroring from the current facing + gait
   * phase. Runs every update regardless of animationState so a stopped stride
   * keeps easing toward neutral (see IDLE_SETTLE_RATE) rather than freezing on
   * whatever pose it happened to be showing.
   */
  private applyPose(): void {
    const { fromIndex, toIndex, blend } = keyframeBlend(this.phase, CYCLE.length);
    const slot = blend < 0.5 ? fromIndex : toIndex;
    const frame = frameIndex(this.state.facing, slot);
    if (frame !== this.currentFrame) {
      this.visual.setFrame(frame);
      this.currentFrame = frame;
    }
    this.visual.setFlipX(MIRRORED.has(this.state.facing));
  }

  getState(): PlayerState {
    return this.state;
  }
}
