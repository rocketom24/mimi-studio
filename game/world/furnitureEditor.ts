import * as Phaser from "phaser";
import { project, unproject } from "@/game/world/projection";
import { visualDepth } from "@/game/world/depth";
import {
  canonicalKind,
  resolveEditorTextureKey,
  isFurnitureEditorItem,
  SCALE_STEP,
  SCALE_MIN,
  SCALE_MAX,
  type FurnitureEditorItem,
  type FurnitureSelection,
} from "@/game/world/furnitureEditorAssets";
import { TILE_SIZE } from "@/game/config/world";
import { ROOMS } from "@/game/world/rooms";
import { WALL_THICKNESS_PAD_PX } from "@/game/world/wallSystem";
import defaultLayout from "@/game/data/furnitureLayout.json";

export type { FurnitureEditorItem };

const SAVE_ENDPOINT = "/api/furniture-layout";

/**
 * Minimal clearance trimmed off a footprint's authored width so Mimi doesn't
 * visually clip the sprite's edge pixels while still walking as close to the
 * piece as the physical object allows. Kept close to 1: this must never
 * undershoot a piece's real width enough to let Mimi walk into it.
 */
const FOOTPRINT_WIDTH_TRIM = 0.95;

/**
 * Footprint depth (front-to-back world extent) as a fraction of the item's
 * real width. Most furniture reads roughly half as deep as it is wide
 * (sofas, tables, beds); flatter kinds get a smaller override below so
 * their collision box doesn't reach further into the room than their real
 * base does.
 */
const FOOTPRINT_DEPTH_RATIO = 0.5;
const FOOTPRINT_DEPTH_RATIO_BY_KIND: Record<string, number> = {
  tv: 0.16,
  bookshelf: 0.3,
  mirror: 0.12,
  "dressing-table": 0.3,
  almirah: 0.35,
  // Generic front-anchored box, deliberately generous (see
  // extendFootprintToCorner below, which stretches it the rest of the way to
  // both walls) — kitchen.png is an L-shaped corner unit, not a simple
  // rectangle, so an exact measured footprint isn't worth chasing; this just
  // needs to fully cover the cabinet run without reaching into the walkway.
  kitchen: 0.6,
};

function footprintDepthRatio(kind: string): number {
  return FOOTPRINT_DEPTH_RATIO_BY_KIND[canonicalKind(kind)] ?? FOOTPRINT_DEPTH_RATIO;
}

/**
 * kitchen is fixed flush against the room's corner (both the north and
 * west walls), not free-standing — but its footprint depth (see
 * MEASURED_FOOTPRINTS) is only a shallow strip centered on the sprite's front
 * floor-contact point. That leaves the strip short of the walls behind it, an
 * uncollided gap Mimi can walk into and read as standing inside/behind the
 * cabinets. extendFootprintToCorner stretches the rect's north and west edges
 * out to the room's actual wall faces so the footprint runs unbroken from
 * both walls to the counter's own front edges.
 */
const BACK_WALL_CORNER_KINDS = new Set(["kitchen"]);

function extendFootprintToCorner(
  rect: { x: number; y: number; w: number; h: number },
  kind: string,
): { x: number; y: number; w: number; h: number } {
  if (!BACK_WALL_CORNER_KINDS.has(canonicalKind(kind))) return rect;
  const bounds = roomBoundsAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
  if (!bounds) return rect;
  const wallFaceY = bounds.y0 - WALL_THICKNESS_PAD_PX;
  const wallFaceX = bounds.x0 - WALL_THICKNESS_PAD_PX;
  const southEdge = rect.y + rect.h;
  const eastEdge = rect.x + rect.w;
  const y = Math.min(rect.y, wallFaceY);
  const x = Math.min(rect.x, wallFaceX);
  return { x, y, w: eastEdge - x, h: southEdge - y };
}

/**
 * Some kinds break the generic width/depth-ratio model above outright — a
 * footprint whose LONG axis runs along world Y and SHORT axis along world X
 * (the opposite of every other kind's assumption), or a center that sits
 * well off to the side of item.x/item.y (the image's declared bottom-center
 * anchor, which for a couch or an off-center console doesn't land on the
 * piece's own footprint at all). Those get an explicit measured entry below
 * instead, applied purely in world space by computeFootprintRect exactly
 * like every other kind. Expressed as fractions of baseDisplayWidth(kind) so
 * they track a future re-scale of BASE_WIDTH_TILES.
 */
interface MeasuredFootprint {
  depthFrac: number; // world-X extent / baseDisplayWidth
  lengthFrac: number; // world-Y extent / baseDisplayWidth
  offsetXFrac: number; // (footprint center X - item.x) / baseDisplayWidth
  offsetYFrac: number; // (footprint center Y - item.y) / baseDisplayWidth
}

/**
 * Per-kind footprints measured directly off the live rendered scene: with
 * the game running, its Phaser camera transform and item.x/item.y read back
 * live, real floor-contact points were picked by eye off screenshots of each
 * piece (front-left/front-right/frontmost corners, or a front-edge span for
 * shallow pieces) and converted through the exact inverse of project() —
 * screenX = (worldX - worldY) * ISO_X_SCALE, screenY = (worldX + worldY) *
 * ISO_Y_SCALE, solved directly for worldX/worldY, the same math
 * unproject() in projection.ts uses. This is deliberately NOT
 * screenToWorldDelta() from projection.ts: that function re-normalizes its
 * result's magnitude for keyboard-input UX and is not a true geometric
 * inverse — using it here (an earlier pass at this table did) silently
 * shrinks every measurement by a direction-dependent amount, which is what
 * left the sofa box undersized by ~30% before this fix. Verified by
 * rendering each computed rect back over the live scene and confirming it
 * sits on the real sprite, not just checked numerically.
 */
const MEASURED_FOOTPRINTS: Partial<Record<string, MeasuredFootprint>> = {
  sofa: { depthFrac: 0.30486, lengthFrac: 0.99965, offsetXFrac: -0.366, offsetYFrac: -0.33587 },
  // tv.png's total display width includes two free-standing floor speakers
  // well clear of the actual console on either side (see BASE_WIDTH_TILES.tv);
  // this footprint covers only the console itself, measured off its own
  // front edge (which runs along world Y here, not X — same "rotated" shape
  // as sofa's, see localFootprint). The speakers are thin poles, left
  // non-colliding rather than inflating the box to reach them.
  tv: { depthFrac: 0.0967, lengthFrac: 0.6026, offsetXFrac: -0.4241, offsetYFrac: -0.3994 },
  centertable: { depthFrac: 0.7945, lengthFrac: 0.9004, offsetXFrac: -0.58973, offsetYFrac: -0.59053 },
  // Same "rotated" shape as sofa/tv — bookshelf.png's front edge runs along
  // world Y, not X.
  bookshelf: { depthFrac: 0.21512, lengthFrac: 0.71707, offsetXFrac: -0.54722, offsetYFrac: -0.65496 },
  almirah: { depthFrac: 0.36966, lengthFrac: 1.05616, offsetXFrac: -0.55428, offsetYFrac: -0.35408 },
  "dressing-table": { depthFrac: 0.28424, lengthFrac: 0.94748, offsetXFrac: -0.84841, offsetYFrac: -0.84589 },
  // Earlier pass picked a bad "back corner" point for the desk's depth,
  // wildly overshooting past the desk's own footprint into the open floor
  // Mimi walks through in front of it — confirmed by rendering it over the
  // live scene. Redone from the desk's actual front-leg span + a reasonable
  // desk depth ratio (0.5, matching a desk about half as deep as it is wide)
  // instead of a mismeasured 3rd point.
  pc: { depthFrac: 0.89162, lengthFrac: 0.44581, offsetXFrac: -0.41564, offsetYFrac: -0.6277 },
  chair: { depthFrac: 0.70313, lengthFrac: 0.74948, offsetXFrac: -0.61487, offsetYFrac: -0.51646 },
  "plant-1": { depthFrac: 0.4931, lengthFrac: 0.45657, offsetXFrac: -0.35521, offsetYFrac: -0.33317 },
  "plant-2": { depthFrac: 0.61384, lengthFrac: 0.63616, offsetXFrac: -0.8448, offsetYFrac: -0.77737 },
  // bed2.png's front edge sits at a real diagonal (~34 deg off world X), not
  // close enough to an axis to force through the width/depth-ratio model's
  // "pick whichever axis dominates" shortcut — that produced boxes that
  // either missed the foot-posts (undersized) or overshot into the walkway
  // beside the dresser (oversized), depending on the ratio tried. Fixed by
  // taking the true oriented rectangle (front edge + a perpendicular depth)
  // and using ITS 4 corners' own axis-aligned bounding box, rather than
  // collapsing the depth onto whichever single world axis the front edge
  // leans toward.
  bed2: { depthFrac: 0.90064, lengthFrac: 0.93927, offsetXFrac: -0.65179, offsetYFrac: -0.59988 },
  clock: { depthFrac: 0.28775, lengthFrac: 0.71939, offsetXFrac: -0.5401, offsetYFrac: -0.61336 },
  "grass-1": { depthFrac: 0.58295, lengthFrac: 1.21074, offsetXFrac: -0.41599, offsetYFrac: -0.06084 },
  // garden-sofa.png is a whole seating-nook GROUP (2-3 chairs + a table,
  // sometimes a plant), not one object — no single rectangle is its "exact
  // physical base." Footprint covers the group's outer extent so Mimi can't
  // cut through the middle of the nook.
  g2: { depthFrac: 0.75684, lengthFrac: 1.41193, offsetXFrac: -0.62864, offsetYFrac: -0.35983 },
};

/**
 * A piece's footprint size and its center's offset from item.x/item.y, both
 * in the piece's own unrotated local frame (local +X = the sprite's declared
 * "right", local +Y = "further from camera"/north). computeFootprintRect
 * rotates this local rect by item.rotation to get the true world-space
 * footprint — see there.
 */
interface LocalFootprint {
  width: number;
  depth: number;
  offsetX: number;
  offsetY: number;
}

function localFootprint(kind: string, bw: number): LocalFootprint {
  const measured = MEASURED_FOOTPRINTS[canonicalKind(kind)];
  if (measured) {
    return {
      width: measured.depthFrac * bw,
      depth: measured.lengthFrac * bw,
      offsetX: measured.offsetXFrac * bw,
      offsetY: measured.offsetYFrac * bw,
    };
  }
  const width = bw * FOOTPRINT_WIDTH_TRIM;
  const depth = width * footprintDepthRatio(kind);
  // item.x/y is the piece's FRONT (camera-facing) floor edge, not its
  // center, so the footprint extends one full depth backward (north, local
  // -Y) from the anchor — its center sits half a depth north of it.
  return { width, depth, offsetX: 0, offsetY: -depth / 2 };
}

/**
 * Bounding box of a `width` x `depth` rectangle centered at (cx, cy) and
 * rotated by `rotationDeg` around that center. Arcade physics static bodies
 * are axis-aligned rects, so a rotation that isn't a multiple of 90 degrees
 * can't be represented exactly — this returns its tight axis-aligned
 * bounding box instead, which always fully covers the true rotated
 * footprint (never underestimates it, so Mimi can never clip through a
 * rotated corner) at the cost of a small amount of extra clearance on the
 * diagonal. At 0/90/180/270, cos/sin land on 0 or 1 and this is exact.
 */
function rotateRectAABB(cx: number, cy: number, width: number, depth: number, rotationDeg: number): { x: number; y: number; w: number; h: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = width * cos + depth * sin;
  const h = width * sin + depth * cos;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Solid floor footprint (world px — same flat space as collision.ts's
 * room-furniture rects) for one placed item, built ONLY from its own
 * world-space state: item.x/item.y (position), baseDisplayWidth(kind)*scale
 * (size), footprintDepthRatio(kind) (depth), and item.rotation (orientation)
 * — see localFootprint's doc comment for what "local" means. Those five
 * values are the single source of truth; nothing here reads the sprite's
 * pixels or calls project()/unproject() — rendering and collision are fully
 * decoupled, so re-skinning a kind's PNG or nudging its display anchor can
 * never silently move its hitbox. The local offset is rotated by
 * item.rotation before being added to item.x/item.y, so a rotated piece's
 * footprint pivots around its own anchor exactly like its sprite does.
 *
 * A prior version derived the footprint by reading the sprite's on-screen
 * bounding box (or its alpha channel) and unprojecting screen-space samples
 * back to world space. Both approaches estimate the footprint from how the
 * sprite happens to look on screen, which is exactly backwards: the footprint
 * should decide the render, not the other way around. Sampling pixels is
 * also lossy on its own terms — project()'s 45-degree shear means the
 * axis-aligned world-space box enclosing an unprojected screen rect is
 * always inflated (driven by the SUM of the screen rect's width and height,
 * not either alone) — which is what left big collision squares sitting over
 * open floor with nothing under them.
 */
function computeFootprintRect(item: PlacedItem): { x: number; y: number; w: number; h: number } {
  const bw = baseDisplayWidth(item.kind) * item.scale;
  const local = localFootprint(item.kind, bw);
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const centerX = item.x + local.offsetX * cos - local.offsetY * sin;
  const centerY = item.y + local.offsetX * sin + local.offsetY * cos;
  const rect = rotateRectAABB(centerX, centerY, local.width, local.depth, item.rotation);
  return extendFootprintToCorner(rect, item.kind);
}

const ROTATE_STEP_DEG = 45;
const SELECTED_TINT = 0x8fd0ff;

/** Fallback display width (tiles) for a PNG with no entry below — e.g. a new asset just dropped into public/furniture/. */
const DEFAULT_DISPLAY_WIDTH_TILES = 2;

/**
 * Realistic display width (tiles) per furniture kind, keyed by the PNG's
 * filename stem with any "-removebg-preview" suffix / " (n)" duplicate
 * suffix stripped (see canonicalKind) — so re-exporting/renaming an asset
 * doesn't silently fall back to the flat default. Human-scale furniture
 * (sofa/bed/dining/kitchen) sized relative to Mimi and to each other; the
 * cat-item entries mirror furnitureSystem.ts's SPRITE_DISPLAY_WIDTH so an
 * item looks the same size whether it's placed via the editor or hardcoded
 * into a room.
 */
const BASE_WIDTH_TILES: Record<string, number> = {
  sofa: 4.0,
  tv: 4.8, // long console + floor speakers spans further than the sofa in-frame
  centertable: 2.2,
  dining: 3.1,
  bed: 4.0,
  almirah: 2.4,
  bookshelf: 2.2,
  "dressing-table": 2.4,
  mirror: 1.4,
  chair: 1.3,
  pc: 3.0,
  "plant-1": 1.1,
  "plant-2": 0.9,
  catbed: 2.2,
  foodbowl: 1.3,
  cattree: 2.0,
  cattoy: 0.6,
  catlitterbox: 1.6,
  kitchen: 4.4,
};

function baseDisplayWidth(kind: string): number {
  const tiles = BASE_WIDTH_TILES[canonicalKind(kind)] ?? DEFAULT_DISPLAY_WIDTH_TILES;
  return tiles * TILE_SIZE;
}

/** Photoreal renders whose fine detail (wood grain, mesh, bezel lines) reads as noisy aliasing under the global pixelArt renderer's nearest-neighbor scaling — see spawn(). */
const LINEAR_FILTER_KINDS = new Set(["pc", "bed2", "almirah", "dressing-table"]);

/**
 * Vertical origin fraction (0=image top, 1=image bottom) for kinds whose PNG
 * has a real transparent margin below its actual floor contact point —
 * measured off each image's alpha bounding box. Anchoring at the raw
 * bottom edge (origin 1, every other kind's default) leaves that margin
 * between the object's visible base and the floor it's supposedly standing
 * on, reading as floating. Only kinds with a non-trivial margin get an
 * entry; everything else keeps the plain bottom anchor.
 */
const ORIGIN_Y_BY_KIND: Record<string, number> = {
  kitchen: 369 / 500, // alpha bbox bottom at y=369 of 500
  pc: 786 / 1024, // alpha bbox bottom at y=786 of 1024
};

function originYFor(kind: string): number {
  return ORIGIN_Y_BY_KIND[canonicalKind(kind)] ?? 1;
}

/** The floor rect (world px) of whichever room contains (x, y), or undefined if it falls in no room (a gap/hallway mid-drag). */
function roomBoundsAt(x: number, y: number): { x0: number; y0: number; x1: number; y1: number } | undefined {
  for (const room of ROOMS) {
    const x0 = room.tiles.x * TILE_SIZE;
    const y0 = room.tiles.y * TILE_SIZE;
    const x1 = x0 + room.tiles.w * TILE_SIZE;
    const y1 = y0 + room.tiles.h * TILE_SIZE;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return { x0, y0, x1, y1 };
  }
  return undefined;
}

/**
 * Clamps a world-space point to the interior floor of whichever room it
 * falls in, inset by WALL_THICKNESS_PAD_PX (the same inset the walls
 * themselves render at — see wallSystem.ts) so a dragged/placed item's own
 * anchor point can never land in or past a wall band. Nothing enforced this
 * before, so an item dropped near a wall could sit flush against, inside,
 * or past it with nothing visually catching the mistake.
 *
 * Points already outside every room (e.g. mid-drag over a gap) pass through
 * unclamped — this only guards the common case of placing/dragging within
 * one room, not cross-room drags.
 */
function clampToRoomFloor(x: number, y: number): { x: number; y: number } {
  const pad = WALL_THICKNESS_PAD_PX;
  const bounds = roomBoundsAt(x, y);
  if (!bounds) return { x, y };
  return { x: Phaser.Math.Clamp(x, bounds.x0 + pad, bounds.x1 - pad), y: Phaser.Math.Clamp(y, bounds.y0 + pad, bounds.y1 - pad) };
}

interface PlacedItem extends FurnitureEditorItem {
  image: Phaser.GameObjects.Image;
  /** scale factor that puts the sprite at its kind's baseline width (item.scale=1) */
  baseScale: number;
}

/**
 * Furniture placement layer, fully additive on top of the game's hardcoded
 * room furniture (rooms.ts/furnitureSystem.ts) — it never reads or writes
 * that data, only adds its own sprites on top. Its layout (game/data/
 * furnitureLayout.json, the project's default) always spawns; only the
 * drag/edit tooling itself is dev-only (gated by `active`, see
 * setActive/GameCanvas.tsx). collision.ts reads collisionRects() below once,
 * right after load(), to turn every spawned item's rendered footprint into
 * solid physics geometry.
 *
 * ponytail: no drop shadow under editor-placed items (existing furnitureSystem
 * pieces get one via a separate Graphics object kept in sync on every
 * move/scale) — add if the dev-only editor look needs to match production
 * furniture exactly.
 */
export class FurnitureEditor {
  private readonly items = new Map<string, PlacedItem>();
  private active = false;
  private selectedId: string | null = null;
  private pendingKind: string | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;

  /** Set by GameCanvas: fired whenever the selection or the selected item's scale changes, so the sidebar's resize slider can track it (including changes made via wheel-resize, not just the slider itself). */
  onSelectionChange: ((selection: FurnitureSelection | null) => void) | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    scene.input.on("pointermove", this.handlePointerMove, this);
    scene.input.on("pointerdown", this.handleCanvasPointerDown, this);
    scene.input.on("drag", this.handleDrag, this);
    // Only scales the selected item while the pointer is over it, so it
    // doesn't fight StudioScene's own wheel-zoom handler on every scroll —
    // ponytail: the two still both fire when hovering a selected item during
    // edit mode (camera zooms a little *and* the item scales); harmless in a
    // dev-only tool, not worth touching the camera code to fully separate.
    scene.input.on("wheel", this.handleWheel, this);
    scene.input.keyboard?.on("keydown-R", this.handleRotateKey, this);
    scene.input.keyboard?.on("keydown-DELETE", this.handleDeleteKey, this);
    scene.input.keyboard?.on("keydown-BACKSPACE", this.handleDeleteKey, this);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.cancelPlacement();
      this.select(null);
    }
  }

  /** Called by the sidebar when a thumbnail is clicked: arms a ghost that follows the pointer until the next canvas click. */
  beginPlacement(kind: string): void {
    if (!this.active) return;
    this.cancelPlacement();
    this.pendingKind = kind;
    this.ghost = this.scene.add.image(0, 0, resolveEditorTextureKey(kind)).setOrigin(0.5, originYFor(kind)).setAlpha(0.6).setDepth(4000);
    this.applyScale(this.ghost, kind, 1);
  }

  /** Spawns every item from game/data/furnitureLayout.json (the project's default layout). Call once at scene boot. */
  load(): void {
    for (const entry of defaultLayout) {
      if (isFurnitureEditorItem(entry)) this.spawn(entry);
    }
  }

  /** Solid collision rects (world px) for every currently spawned item — call after load(). */
  collisionRects(): { x: number; y: number; w: number; h: number }[] {
    return Array.from(this.items.values()).map(computeFootprintRect);
  }

  /**
   * Serializes every placed item's world x/y/rotation/scale and persists it
   * as the project's default layout (game/data/furnitureLayout.json, via the
   * dev-only save API route) — the same layout load() reads on next boot, in
   * this browser or a fresh one. Throws on failure so the sidebar can surface it.
   */
  async save(): Promise<void> {
    const data: FurnitureEditorItem[] = Array.from(this.items.values()).map(({ id, kind, x, y, rotation, scale }) => ({
      id,
      kind,
      x,
      y,
      rotation,
      scale,
    }));
    const response = await fetch(SAVE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`Save failed (${response.status})`);
  }

  private spawn(data: FurnitureEditorItem): void {
    const anchor = project(data.x, data.y);
    const image = this.scene.add.image(anchor.x, anchor.y, resolveEditorTextureKey(data.kind)).setOrigin(0.5, originYFor(data.kind));
    // These are high-detail photoreal renders (fine mesh/wood-grain/bezel lines), unlike
    // the game's flatter-shaded furniture — the global pixelArt renderer's nearest-neighbor
    // scaling turns that detail into noisy aliasing. Smooth just these textures.
    if (LINEAR_FILTER_KINDS.has(canonicalKind(data.kind))) {
      image.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    const baseScale = this.applyScale(image, data.kind, data.scale);
    image.setAngle(data.rotation);
    image.setDepth(visualDepth(data.y));
    image.setInteractive({ draggable: true, useHandCursor: true });

    const item: PlacedItem = { ...data, image, baseScale };
    this.items.set(data.id, item);

    image.on("pointerdown", () => this.select(item.id));
  }

  /**
   * Sets the image's display size to `kind`'s realistic baseline width
   * scaled by `itemScale`, returning the scale factor that produced it
   * (the width-axis scale — same meaning `applyBaseSize` used to return,
   * still what handleWheel scales up/down). Scales both axes uniformly, so
   * the PNG keeps its own drawn (isometric) proportions, never squashed to a
   * fake floor-plan aspect.
   */
  private applyScale(image: Phaser.GameObjects.Image, kind: string, itemScale: number): number {
    const naturalW = image.width || 1;
    const baseScale = baseDisplayWidth(kind) / naturalW;
    const scale = baseScale * itemScale;
    image.setScale(scale, scale);
    return baseScale;
  }

  private select(id: string | null): void {
    if (this.selectedId === id) return;
    const prev = this.selectedId ? this.items.get(this.selectedId) : null;
    prev?.image.clearTint();
    this.selectedId = id;
    const next = id ? this.items.get(id) : null;
    next?.image.setTint(SELECTED_TINT);
    this.notifySelection();
  }

  /** Fires onSelectionChange with the current selection's id/kind/scale (or null). Called on every select() as well as every scale change to the selected item, so the sidebar slider tracks wheel-resize too. */
  private notifySelection(): void {
    if (!this.onSelectionChange) return;
    const item = this.selectedId ? this.items.get(this.selectedId) : null;
    this.onSelectionChange(item ? { id: item.id, kind: item.kind, scale: item.scale } : null);
  }

  /** Resizes the currently selected item to `scale` (clamped to SCALE_MIN/SCALE_MAX) — the sidebar slider's write path, sharing the same apply/clamp logic as wheel-resize (handleWheel). No-op if nothing is selected. */
  setSelectedScale(scale: number): void {
    if (!this.selectedId) return;
    const item = this.items.get(this.selectedId);
    if (!item) return;
    item.scale = Phaser.Math.Clamp(scale, SCALE_MIN, SCALE_MAX);
    this.applyScale(item.image, item.kind, item.scale);
    this.notifySelection();
  }

  private cancelPlacement(): void {
    this.pendingKind = null;
    this.ghost?.destroy();
    this.ghost = null;
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.active || !this.ghost) return;
    this.ghost.setPosition(pointer.worldX, pointer.worldY);
  }

  /** Drops a pending ghost at the clicked point; does nothing if no placement is armed (so it never interferes with normal item selection/drag clicks). */
  private handleCanvasPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.active || !this.pendingKind) return;
    const kind = this.pendingKind;
    this.cancelPlacement();
    this.dropItemAt(kind, pointer.worldX, pointer.worldY);
  }

  /**
   * Places `kind` at a browser drag-and-drop landing point: `pageX`/`pageY`
   * (from the DOM `drop` event, e.g. e.clientX/clientY) are converted through
   * the same canvas-scaling transform Phaser's own input plugin uses
   * (game.scale.transformX/Y) into camera-space coordinates, then into a
   * world point — the same pipeline pointer.worldX/worldY (used by the
   * click-to-place path above) is built from internally.
   */
  placeAt(kind: string, pageX: number, pageY: number): void {
    if (!this.active) return;
    const scaleManager = this.scene.game.scale;
    const camX = scaleManager.transformX(pageX);
    const camY = scaleManager.transformY(pageY);
    const worldPoint = this.scene.cameras.main.getWorldPoint(camX, camY);
    this.dropItemAt(kind, worldPoint.x, worldPoint.y);
  }

  /** Shared by the click-to-place and drag-and-drop paths: unprojects a screen-space point to world floor coordinates, clamps it to the room it lands in, spawns `kind` there, and selects it. */
  private dropItemAt(kind: string, screenX: number, screenY: number): void {
    const dropped = unproject(screenX, screenY);
    const { x, y } = clampToRoomFloor(dropped.x, dropped.y);
    const id = `${kind}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    this.spawn({ id, kind, x, y, rotation: 0, scale: 1 });
    this.select(id);
  }

  private handleDrag(_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Image, dragX: number, dragY: number): void {
    if (!this.active) return;
    const item = this.findByImage(gameObject);
    if (!item) return;
    const dragged = unproject(dragX, dragY);
    const { x, y } = clampToRoomFloor(dragged.x, dragged.y);
    const anchor = project(x, y);
    gameObject.setPosition(anchor.x, anchor.y);
    item.x = x;
    item.y = y;
    gameObject.setDepth(visualDepth(y));
  }

  private handleWheel(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[], _dx: number, deltaY: number): void {
    if (!this.active || !this.selectedId) return;
    const item = this.items.get(this.selectedId);
    if (!item || !currentlyOver.includes(item.image)) return;
    item.scale = Phaser.Math.Clamp(item.scale - Math.sign(deltaY) * SCALE_STEP, SCALE_MIN, SCALE_MAX);
    this.applyScale(item.image, item.kind, item.scale);
    this.notifySelection();
  }

  private handleRotateKey(): void {
    if (!this.active || !this.selectedId) return;
    const item = this.items.get(this.selectedId);
    if (!item) return;
    item.rotation = (item.rotation + ROTATE_STEP_DEG) % 360;
    item.image.setAngle(item.rotation);
  }

  private handleDeleteKey(): void {
    if (!this.active || !this.selectedId) return;
    const item = this.items.get(this.selectedId);
    if (!item) return;
    item.image.destroy();
    this.items.delete(item.id);
    this.select(null);
  }

  private findByImage(image: Phaser.GameObjects.Image): PlacedItem | undefined {
    for (const item of this.items.values()) if (item.image === image) return item;
    return undefined;
  }
}
