import * as Phaser from "phaser";
import { project, unproject } from "@/game/world/projection";
import { visualDepth } from "@/game/world/depth";
import { canonicalKind, editorTextureKey } from "@/game/world/furnitureEditorAssets";
import { TILE_SIZE } from "@/game/config/world";
import { ROOMS } from "@/game/world/rooms";
import { WALL_THICKNESS_PAD_PX } from "@/game/world/wallSystem";

export interface FurnitureEditorItem {
  id: string;
  /** File stem of a public/furniture/ PNG (e.g. "catBed") — see furnitureEditorAssets.ts. Not tied to the production FurnitureKind union, so any PNG dropped in that folder works with no code change. */
  kind: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

const STORAGE_KEY = "mimi-studio:furnitureEditor:v1";

/**
 * Baked-in snapshot of the last layout saved from the browser (editor's
 * "Save layout" button, localStorage key above) — the permanent baseline so
 * every build shows this furniture even with no localStorage entry (fresh
 * browser, production). load() prefers a real localStorage save over this
 * when one exists, so it stays purely a fallback.
 */
const DEFAULT_ITEMS: FurnitureEditorItem[] = [
  { id: "sofa-removebg-preview-1788435297019-407587", kind: "sofa-removebg-preview", x: 102.14768981180916, y: 143.58179222894825, rotation: 0, scale: 1 },
  { id: "tv-removebg-preview-1788435302309-827849", kind: "tv-removebg-preview", x: 57.768225882188844, y: 146.42777174513265, rotation: 0, scale: 1.8 },
  { id: "bed-removebg-preview-1788435313131-81672", kind: "bed-removebg-preview", x: 336.52330987017353, y: 233.6030140210895, rotation: 0, scale: 1 },
  { id: "pc-1788435327182-565160", kind: "pc", x: 326.2045364150044, y: 45.062079629544655, rotation: 0, scale: 1 },
  { id: "chair-1788435337352-491020", kind: "chair", x: 360.31602181570827, y: 35.17984357222838, rotation: 0, scale: 1 },
  { id: "plant-2-1788435346761-645199", kind: "plant-2", x: 28.81531762282947, y: 29.163937456504975, rotation: 0, scale: 1 },
  { id: "plant-2-1788435354439-163005", kind: "plant-2", x: 254.92067619348927, y: 27.731492247743304, rotation: 0, scale: 1 },
  { id: "centertable-removebg-preview-1788435415150-773159", kind: "centertable-removebg-preview", x: 59.93881259212219, y: 131.35421311070775, rotation: 0, scale: 1 },
  { id: "bookshelf-removebg-preview-1788439324357-786572", kind: "bookshelf-removebg-preview", x: 263.18034487464575, y: 74.75782851402936, rotation: 0, scale: 1 },
  { id: "almirah-removebg-preview-1788439329424-82462", kind: "almirah-removebg-preview", x: 257.61221032656744, y: 218.54097524908204, rotation: 0, scale: 1 },
  { id: "dressing-table-removebg-preview-1788439337469-573029", kind: "dressing-table-removebg-preview", x: 258.4851651046857, y: 180.54928434014008, rotation: 0, scale: 1 },
  { id: "mirror-removebg-preview (1)-1788439343555-29770", kind: "mirror-removebg-preview (1)", x: 236.82220701869514, y: 161.10716315055296, rotation: 0, scale: 1 },
  { id: "kitchen-removebg-preview-1788439355165-835245", kind: "kitchen-removebg-preview", x: 143.77496410720914, y: 45.666481162170484, rotation: 0, scale: 1 },
  { id: "dining-removebg-preview-1788439365256-881947", kind: "dining-removebg-preview", x: 177.89121387407212, y: 92.7376133676747, rotation: 0, scale: 1 },
  { id: "fridge-removebg-preview-1788439379412-137200", kind: "fridge-removebg-preview", x: 127.07557686721097, y: 79.41492805099716, rotation: 0, scale: 1 },
  { id: "sink-removebg-preview-1788452301324-233947", kind: "sink-removebg-preview", x: 186.25479248016717, y: 37.61396203277987, rotation: 0, scale: 0.9 },
];
const ROTATE_STEP_DEG = 45;
const SCALE_STEP = 0.1;
const SCALE_MIN = 0.3;
const SCALE_MAX = 3;
const SELECTED_TINT = 0x8fd0ff;

/** Fallback display width (tiles) for a PNG with no entry below — e.g. a new asset just dropped into public/furniture/. */
const DEFAULT_DISPLAY_WIDTH_TILES = 2;

/**
 * kitchen.png's own target width (tiles) — pulled out as a named constant
 * because fridge/sink below derive their own size from it (see their
 * comments) rather than each picking an independent number.
 */
const KITCHEN_WIDTH_TILES = 3.55; // max width that stays clear of the back wall (WALL_HEIGHT_PX, see wallSystem.ts) — bigger clips it, confirmed by screenshot

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
  kitchen: KITCHEN_WIDTH_TILES,
  // kitchen.png and fridge.png are the same real-world camera scale (checked
  // against each corner's own raw-pixel floor-to-top span: ~251px counter
  // height in kitchen.png, ~500px full-height in fridge.png, ratio matches a
  // real ~90cm counter vs ~180cm fridge) — fridge's width is KITCHEN_WIDTH_TILES'
  // own per-raw-pixel scale applied to fridge's 418px width, scaled down
  // 0.82x from that exact ratio per feedback that the 1:1 match still read
  // as too big next to the counter run.
  fridge: KITCHEN_WIDTH_TILES * (418 / 566) * 0.82,
  // Tried literal equal width first (matching the direct request) and
  // screenshotted kitchen.png next to sink.png at that size — sink stood
  // visibly taller than the counter top and poked above the wall, reading
  // as two mismatched objects, not "one kitchen countertop." Its actual
  // counter-to-cabinet-door seam sits at a different fraction of its own
  // frame than kitchen.png's (sampled both PNGs' pixel colors directly:
  // kitchen's seam ~y203 of its ~217px cabinet-to-floor span, sink's ~y191
  // of its ~375px span) — scaled here so that seam lines up with kitchen's
  // instead, which is what actually reads as one continuous counter.
  sink: KITCHEN_WIDTH_TILES * 0.431,
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
};

function baseDisplayWidth(kind: string): number {
  const tiles = BASE_WIDTH_TILES[canonicalKind(kind)] ?? DEFAULT_DISPLAY_WIDTH_TILES;
  return tiles * TILE_SIZE;
}

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
  kitchen: 420 / 441, // alpha bbox bottom at y=420 of 441
  fridge: 541 / 596, // alpha bbox bottom at y=541 of 596
  sink: 566 / 592, // alpha bbox bottom at y=566 of 592
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
 * that data, only adds its own sprites on top. Its layout (DEFAULT_ITEMS,
 * or a localStorage save on top of it) always spawns; only the drag/edit
 * tooling itself is dev-only (gated by `active`, see setActive/GameCanvas.tsx).
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
    this.ghost = this.scene.add.image(0, 0, editorTextureKey(kind)).setOrigin(0.5, originYFor(kind)).setAlpha(0.6).setDepth(4000);
    this.applyScale(this.ghost, kind, 1);
  }

  /** Reads every item back out of localStorage (falling back to the baked-in DEFAULT_ITEMS when there's no save yet) and spawns it. Call once at scene boot. */
  load(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      // ignore — falls through to DEFAULT_ITEMS below
    }
    let parsed: unknown = DEFAULT_ITEMS;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = DEFAULT_ITEMS;
      }
    }
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      // Items saved before per-kind BASE_WIDTH_TILES existed used their `scale`
      // as a manual stand-in for realistic size (every kind shared one flat
      // baseline width). That manual value would now stack on top of the
      // correct per-kind baseline, so it's reset to neutral on load — a
      // one-time size correction that never touches position/rotation.
      if (isFurnitureEditorItem(entry)) this.spawn({ ...entry, scale: 1 });
    }
  }

  /** Serializes every placed item's world x/y/rotation/scale to localStorage. */
  save(): void {
    const data: FurnitureEditorItem[] = Array.from(this.items.values()).map(({ id, kind, x, y, rotation, scale }) => ({
      id,
      kind,
      x,
      y,
      rotation,
      scale,
    }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // dev-only convenience feature — a full quota/storage failure isn't worth surfacing to the user
    }
  }

  private spawn(data: FurnitureEditorItem): void {
    const anchor = project(data.x, data.y);
    const image = this.scene.add.image(anchor.x, anchor.y, editorTextureKey(data.kind)).setOrigin(0.5, originYFor(data.kind));
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
    const dropped = unproject(pointer.worldX, pointer.worldY);
    const { x, y } = clampToRoomFloor(dropped.x, dropped.y);
    this.cancelPlacement();
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

function isFurnitureEditorItem(value: unknown): value is FurnitureEditorItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.kind === "string" &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.rotation === "number" &&
    typeof v.scale === "number"
  );
}
