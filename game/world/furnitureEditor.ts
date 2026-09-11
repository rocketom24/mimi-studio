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
import {
  type Point,
  type CollisionShapeMap,
  type FootprintItem,
  type FootprintPolygon,
  computeItemFootprintPolygons,
  obbToPolygon,
  pointInPolygon,
  worldPointToLocal,
} from "@/game/world/collisionShapes";
export type { FurnitureEditorItem };

/** Phaser loader cache keys `preloadFurnitureEditorData` fetches these under — see StudioScene.preload(). */
const LAYOUT_CACHE_KEY = "furnitureLayoutData";
const COLLISION_SHAPES_CACHE_KEY = "furnitureCollisionShapesData";
const INSTANCE_COLLISION_SHAPES_CACHE_KEY = "furnitureInstanceCollisionShapesData";

const SAVE_ENDPOINT = "/api/furniture-layout";
const SAVE_COLLISION_ENDPOINT = "/api/furniture-collision-shapes";
const SAVE_INSTANCE_COLLISION_ENDPOINT = "/api/furniture-instance-collision-shapes";

/**
 * Loads the three persisted-editor-data files (layout, kind collision
 * defaults, instance collision overrides) through Phaser's own loader
 * instead of a bundler-tracked `import` — call once from the scene's
 * preload(). This is what lets Save (which writes those same files on disk
 * via the API routes above) never look like a source-code change to the dev
 * server: a runtime fetch through Phaser's loader has no effect on the
 * module graph, so it can never trigger Turbopack's "recompile and reload
 * the page" fallback the way a static JSON import did (see the API routes'
 * GET handlers' doc comments) — that forced reload was silently wiping
 * whatever editor panel was open, reading as a random disappearing panel.
 */
export function preloadFurnitureEditorData(scene: Phaser.Scene): void {
  scene.load.json(LAYOUT_CACHE_KEY, SAVE_ENDPOINT);
  scene.load.json(COLLISION_SHAPES_CACHE_KEY, SAVE_COLLISION_ENDPOINT);
  scene.load.json(INSTANCE_COLLISION_SHAPES_CACHE_KEY, SAVE_INSTANCE_COLLISION_ENDPOINT);
}

/** Collision-editing status for the placed item currently being edited, surfaced to the panel via onCollisionShapesChange — always one specific instance now (see beginInstanceCollisionEdit), never a kind's shared template. */
export interface CollisionEditInfo {
  itemId: string;
  kind: string;
  shapeCount: number;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export type CollisionTool = "select" | "rect" | "poly";

/**
 * Minimal clearance trimmed off a footprint's authored width so Mimi doesn't
 * visually clip the sprite's edge pixels while still walking as close to the
 * piece as the physical object allows. Kept close to 1: this must never
 * undershoot a piece's real width enough to let Mimi walk into it.
 */
const FOOTPRINT_WIDTH_TRIM = 0.95;

/**
 * Footprint width as a fraction of the item's display width (bw) — the
 * generic model's other axis. Defaults to FOOTPRINT_WIDTH_TRIM (near
 * full-width), right for furniture whose base spans nearly its whole
 * sprite. g10 is the only kind still on the generic model with a narrow
 * override (a plant pot, much narrower than its own foliage) — every other
 * off-default kind's art has enough transparent margin around/below the
 * real object that it also needs an offset correction the generic model
 * can't express, so those get a full MEASURED_FOOTPRINTS entry instead
 * (see below).
 */
const FOOTPRINT_WIDTH_FRAC_BY_KIND: Record<string, number> = {
  g10: 0.48,
};

function footprintWidthFrac(kind: string): number {
  return FOOTPRINT_WIDTH_FRAC_BY_KIND[canonicalKind(kind)] ?? FOOTPRINT_WIDTH_TRIM;
}

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
  // kitchen.png is an L-shaped corner unit, not a simple rectangle, so an
  // exact measured footprint isn't worth chasing — extendFootprintToCorner
  // below stretches this the rest of the way to both walls, so this only
  // needs to cover the counter's own front-to-back depth. 0.6 (deliberately
  // "generous") turned out to badly overshoot at this item's actual placed
  // scale — its footprint reached past the counter into open living-room
  // floor, and even past the room's own walls — confirmed via a walkability
  // grid scan; 0.32 matches the counter's real proportions (see the alpha
  // bbox measurement in MEASURED_FOOTPRINTS' doc comment) without losing
  // the corner-stretch behavior.
  kitchen: 0.32,
  g10: 0.85,
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
 * instead, applied purely in world space by computeFootprintObb exactly
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
  // cut through the middle of the nook. Kept under both its pre-rename key
  // (g2, for any item saved before the rename) and its current filename key
  // (garden-sofa, what freshly-placed items are tagged with today) — see
  // canonicalKind()/RENAMED_STEMS in furnitureEditorAssets.ts.
  g2: { depthFrac: 0.75684, lengthFrac: 1.41193, offsetXFrac: -0.62864, offsetYFrac: -0.35983 },
  "garden-sofa": { depthFrac: 0.75684, lengthFrac: 1.41193, offsetXFrac: -0.62864, offsetYFrac: -0.35983 },

  // --- Entries below share one derivation, done for every kind whose art
  // has a real transparent margin below the object (most of the current
  // furniture catalog): each PNG's alpha channel was scanned in-browser
  // (canvas getImageData over the already-loaded texture) for its real
  // content bounding box — left/right/bottom as a fraction of the full
  // image — since origin stays the sprite's default bottom-center (changing
  // it would shift the sprite on screen, a visual change), that margin
  // means the placement anchor sits BELOW the real object in screen space.
  // A screen-space gap isn't a simple world-Y offset under this isometric
  // shear (screenX=(wx-wy)*0.7, screenY=(wx+wy)*0.35) — a purely vertical
  // screen delta maps to EQUAL parts world X and Y (solved the same exact
  // inverse used throughout this table). Skipping that step is what left
  // sofa3/cat-house/etc.'s boxes sitting beside their sprite instead of on
  // it. Width/depth chosen by eye off the same alpha bbox (trimmed narrower
  // than the raw bbox for anything whose art reads wider than its true
  // floor base, e.g. a plant's foliage); offset computed from it.
  //
  // bed.png: headboard bed + 2 matching nightstands/lamps, footprint spans
  // the full composite, centered.
  bed: { depthFrac: 0.18, lengthFrac: 1.0, offsetXFrac: -0.0591, offsetYFrac: -0.5464 },
  // cozy.png: corner sectional + side table (w/ speaker) + floor lamp —
  // footprint covers the sectional's own solid base; the lamp (thin pole on
  // a small round foot) and side table are left non-colliding rather than
  // inflating the box to reach them (same tradeoff as tv's floor speakers).
  cozy: { depthFrac: 0.85, lengthFrac: 0.289, offsetXFrac: -0.2448, offsetYFrac: -0.3711 },
  // Etable.png: ornate console cabinet with decor (frame/vase/phone) on top
  // — footprint is the cabinet body only, decor doesn't collide.
  etable: { depthFrac: 0.55, lengthFrac: 0.2475, offsetXFrac: -0.1089, offsetYFrac: -0.2326 },
  // dining.png: square table + 2 chairs.
  dining: { depthFrac: 0.55, lengthFrac: 0.3025, offsetXFrac: -0.0917, offsetYFrac: -0.2312 },
  // cat-house.png: roofed cat house on short legs — footprint is the base
  // between the legs, narrower than the overhanging roof.
  "cat-house": { depthFrac: 0.55, lengthFrac: 0.4125, offsetXFrac: -0.1679, offsetYFrac: -0.3692 },
  // cat-tower.png: tall multi-platform tower — footprint is the base
  // platform, narrower than the wider top perch.
  "cat-tower": { depthFrac: 0.45, lengthFrac: 0.3825, offsetXFrac: -0.0578, offsetYFrac: -0.2699 },
  // cat-toys.png: small toys scattered flat on the floor — thin, minor
  // footprint, mostly to keep Mimi from reading as walking "through" them.
  "cat-toys": { depthFrac: 0.6, lengthFrac: 0.27, offsetXFrac: -0.1167, offsetYFrac: -0.2813 },
  // sofa3.png: front-facing cream sofa, base close to full sprite width.
  sofa3: { depthFrac: 0.8, lengthFrac: 0.336, offsetXFrac: -0.2483, offsetYFrac: -0.4163 },
  // almari4.png: tall wardrobe, front view, shallow depth.
  almari4: { depthFrac: 0.85, lengthFrac: 0.255, offsetXFrac: -0.083, offsetYFrac: -0.1983 },
  // dressingtable.png: simple desk with a drawer tower on one end.
  dressingtable: { depthFrac: 0.85, lengthFrac: 0.2975, offsetXFrac: -0.0136, offsetYFrac: -0.1752 },
  // Bookshelf1.png: large corner L-shaped bookshelf/cabinet — same
  // over-cover-the-notch tradeoff as kitchen's corner counter.
  bookshelf1: { depthFrac: 0.85, lengthFrac: 0.4675, offsetXFrac: -0.0834, offsetYFrac: -0.3178 },
  // g3-g11: potted plants — footprint is the pot/base, well narrower than
  // the foliage's spread.
  g3: { depthFrac: 0.35, lengthFrac: 0.2975, offsetXFrac: -0.1824, offsetYFrac: -0.1889 },
  g4: { depthFrac: 0.4, lengthFrac: 0.34, offsetXFrac: -0.0609, offsetYFrac: -0.2444 },
  g5: { depthFrac: 0.5, lengthFrac: 0.425, offsetXFrac: -0.3093, offsetYFrac: -0.456 },
  g6: { depthFrac: 0.65, lengthFrac: 0.26, offsetXFrac: -0.2132, offsetYFrac: -0.3405 }, // three pots side by side
  g7: { depthFrac: 0.55, lengthFrac: 0.3025, offsetXFrac: -0.1786, offsetYFrac: -0.2703 }, // wide flat succulent bowl
  g8: { depthFrac: 0.4, lengthFrac: 0.34, offsetXFrac: -0.2951, offsetYFrac: -0.4509 },
  g11: { depthFrac: 0.4, lengthFrac: 0.34, offsetXFrac: -0.1207, offsetYFrac: -0.2907 },
};

/**
 * A piece's footprint size and its center's offset from item.x/item.y, both
 * in the piece's own unrotated local frame (local +X = the sprite's declared
 * "right", local +Y = "further from camera"/north). computeFootprintObb
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
  const width = bw * footprintWidthFrac(kind);
  const depth = width * footprintDepthRatio(kind);
  // item.x/y is the piece's FRONT (camera-facing) floor edge, not its
  // center, so the footprint extends one full depth backward (north, local
  // -Y) from the anchor — its center sits half a depth north of it.
  return { width, depth, offsetX: 0, offsetY: -depth / 2 };
}

/**
 * LEGACY FALLBACK ONLY. This guessed-ratio footprint (width/depth fractions,
 * MEASURED_FOOTPRINTS' hand-picked-off-screenshots table, the corner-stretch
 * hack) is what the manual collision editor (see Collision-mode methods
 * below) replaces — it now runs only for a kind with no hand-drawn shape in
 * `collisionShapes` yet, so nothing goes walk-through the moment that map is
 * empty. Once a kind has an authored shape, footprintPolygons() never calls
 * this for it again.
 *
 * Solid floor footprint (world px — same flat space as collision.ts's
 * room-furniture rects) for one placed item, built ONLY from its own
 * world-space state: item.x/item.y (position), baseDisplayWidth(kind)*scale
 * (size), footprintDepthRatio(kind) (depth), and item.rotation (orientation)
 * — see localFootprint's doc comment for what "local" means. The local
 * offset is rotated by item.rotation before being added to item.x/item.y, so
 * a rotated piece's footprint pivots around its own anchor exactly like its
 * sprite does.
 *
 * Returned as an oriented rectangle (center + half-extents + angle) —
 * footprintPolygons() converts it to a 4-corner polygon (obbToPolygon) so it
 * flows through the same general SAT test (polygonOverlapsAabb) an authored
 * shape does.
 *
 * extendFootprintToCorner's back-wall stretch only makes sense for an
 * axis-aligned rect (it slides individual edges out to the room's wall
 * faces), so BACK_WALL_CORNER_KINDS keeps the old rect math and reports it
 * as an angle-0 obb — those kinds (currently just "kitchen") are always
 * placed unrotated in practice.
 */
interface LegacyFootprintObb {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  angleDeg: number;
}

function computeFootprintObb(item: PlacedItem): LegacyFootprintObb {
  const bw = baseDisplayWidth(item.kind) * item.scale;
  const local = localFootprint(item.kind, bw);
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const centerX = item.x + local.offsetX * cos - local.offsetY * sin;
  const centerY = item.y + local.offsetX * sin + local.offsetY * cos;

  if (BACK_WALL_CORNER_KINDS.has(canonicalKind(item.kind))) {
    const rect = extendFootprintToCorner(
      { x: centerX - local.width / 2, y: centerY - local.depth / 2, w: local.width, h: local.depth },
      item.kind,
    );
    return { cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, halfW: rect.w / 2, halfH: rect.h / 2, angleDeg: 0 };
  }

  return { cx: centerX, cy: centerY, halfW: local.width / 2, halfH: local.depth / 2, angleDeg: item.rotation };
}

const ROTATE_STEP_DEG = 45;
/** Minimum world-px extent (each axis) a click-drag rectangle needs to commit as a shape — well above a stray click's few-pixel jitter, so an accidental tap can never leave a sliver behind. */
const MIN_SHAPE_SIZE_PX = 4;
/** Minimum world-px² area (either tool) a shape needs to actually commit — belt-and-suspenders alongside MIN_SHAPE_SIZE_PX for the rectangle tool, and the only guard for the polygon tool (3+ nearly-collinear points can pass the point-count check but still enclose ~no area). */
const MIN_SHAPE_AREA_PX2 = 16;
/** Two clicks on the same shape faster than this count as a double-click (focus toggle) rather than two separate selects. */
const DOUBLE_CLICK_MS = 350;
/** Cap on how many undo snapshots one editing session keeps, so a long drawing session can't grow the stack unbounded. */
const UNDO_HISTORY_LIMIT = 50;
/** Drawn vertex-handle radius (screen px). */
const VERTEX_RADIUS_PX = 5;
/** Grabbable radius (screen px) — bigger than the drawn dot so a vertex is easy to grab without pixel-precise aim. */
const VERTEX_HIT_RADIUS_PX = 12;

/** Shoelace-formula polygon area (absolute value, world px²) — used only to reject degenerate near-zero-area shapes before they're saved (see addShape), not part of the runtime collision math. */
function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}
const SELECTED_TINT = 0x8fd0ff;

/** How far bodyRenderDepth() steps past a piece's depth to settle the order. Depths are spaced in world px (see visualDepth), so a fraction of a pixel is unambiguous without disturbing anything else. */
const DEPTH_NUDGE = 0.5;

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
 * setActive/GameCanvas.tsx). Player.ts calls footprintPolygons() below every
 * frame to resolve Mimi's movement against every spawned item's exact
 * (possibly rotated) footprint — see collisionShapes.ts.
 *
 * Two editor sub-modes (`mode`, see setMode): "place" is the original
 * drag/rotate/resize placement tool; "collision" is the manual
 * collision-shape editor — pick a kind, draw polygons/rectangles directly
 * over an unrotated preview of it, save. Both share the same `active` gate
 * and the same pointer/drag/wheel listeners registered once below, branching
 * on `mode` internally, rather than doubling up input wiring.
 *
 * ponytail: no drop shadow under editor-placed items (existing furnitureSystem
 * pieces get one via a separate Graphics object kept in sync on every
 * move/scale) — add if the dev-only editor look needs to match production
 * furniture exactly.
 */
export class FurnitureEditor {
  private readonly items = new Map<string, PlacedItem>();
  private active = false;
  /** Set by StudioScene while a Space+drag camera pan is in progress, so a drag that's really panning the camera never also places an item, draws a shape, or grabs a placed piece. */
  private inputSuspended = false;
  private selectedId: string | null = null;
  private pendingKind: string | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;

  /** Set by GameCanvas: fired whenever the selection or the selected item's scale changes, so the sidebar's resize slider can track it (including changes made via wheel-resize, not just the slider itself). */
  onSelectionChange: ((selection: FurnitureSelection | null) => void) | null = null;

  // --- Collision-shape editing state (collisionActive) ---
  /** Whether the Collision Editor (a separate top-level toggle from Place mode's `active`) is open — mutually exclusive with `active`, enforced by setActive/setCollisionActive, so collision editing can never also drag/place furniture. */
  private collisionActive = false;
  /** Working copy of every kind's authored shapes — read-only fallback data now (seeds a fresh instance's first edit, see currentEffectiveLocalShapes); nothing in the redesigned Collision Editor writes to this map directly anymore, only to instanceCollisionShapes below. Populated from the Phaser loader cache in load(), not a static import — see preloadFurnitureEditorData. */
  private readonly collisionShapes: CollisionShapeMap = {};
  /** Scratch rects reused by bodyRenderDepth()'s per-frame sprite-overlap test, so it allocates nothing in the update loop. */
  private readonly bodyBounds = new Phaser.Geom.Rectangle();
  private readonly itemBounds = new Phaser.Geom.Rectangle();
  /** Per-placed-instance collision overrides, keyed by item id — same local (fraction-of-baseWidth) point convention as collisionShapes, so both flow through the same transform/edit math. Every shape drawn in the Collision Editor lands here, scoped to the one placed item that was clicked. Populated from the Phaser loader cache in load(). */
  private readonly instanceCollisionShapes = new Map<string, Point[][]>();
  /** Canonical kind of whichever item editingInstanceId names — cached alongside it purely so baseWidth lookups don't need an extra items.get() at every mutation site. Always set/cleared together with editingInstanceId. */
  private editingKind: string | null = null;
  /** The placed item currently being edited, directly in its real world position/rotation/scale — see beginInstanceCollisionEdit. Every edit target is a real placed instance now; there is no more "edit a kind's shared template on a throwaway preview" mode. */
  private editingInstanceId: string | null = null;
  /** The tint applied to the instance currently being edited (see beginInstanceCollisionEdit) — tracked so teardownCollisionUi can clear it without needing to look the item back up (it may since have been deleted). */
  private editingInstanceTintedImage: Phaser.GameObjects.Image | null = null;
  /** Set by a placed item's own pointerdown handler (collision mode only) when the click landed on a real, opaque pixel of its sprite — read once by the very next scene-wide handleCollisionPointerDown as a fallback ("clicked real furniture, no shape drawn there yet") after its own shape/global-collision hit-tests come up empty, then cleared. Phaser's default topOnly input means at most one item's handler can set this per click. */
  private lastOpaqueHitId: string | null = null;
  /** Select/Edit (default: click to select+move+resize), Draw Rectangle, or Draw Polygon — see setTool. Auto-reverts to "select" the moment a shape commits (addShape), so drawing never silently stacks shape after shape. */
  private currentTool: CollisionTool = "select";
  private drawingPoints: Point[] | null = null;
  private rectDragStart: Point | null = null;
  private lastPointerFloor: Point = { x: 0, y: 0 };
  private draggingShapeIndex: number | null = null;
  private shapeDragLast: Point | null = null;
  /** Whether the in-progress whole-shape drag has already pushed its pre-drag undo snapshot — pushed lazily on the first real move so a plain click-to-select (no movement) never eats an undo step. */
  private shapeDragSnapshotPushed = false;
  private selectedShapeIndex: number | null = null;
  /** Set by double-clicking a shape: every other shape is drawn dimmed (and its vertex handles hidden) so the focused one is easy to work on. Cleared by focusing again, selecting elsewhere, or switching kind. */
  private focusedShapeIndex: number | null = null;
  private lastClickShapeIndex: number | null = null;
  private lastClickTime = 0;
  /** Snapshots of the editing instance's shape array, most-recent last — Undo pops one off here onto redoStack and vice versa. Reset whenever the edit target changes (see beginInstanceCollisionEdit). */
  private undoStack: Point[][][] = [];
  private redoStack: Point[][][] = [];
  private shapesGraphics: Phaser.GameObjects.Graphics | null = null;
  private vertexHandles: Phaser.GameObjects.Arc[] = [];

  /** Set by GameCanvas: fired whenever collision-editing state (shape count, selection, undo/redo availability) for the item currently being edited changes, so the panel can reflect it. */
  onCollisionShapesChange: ((info: CollisionEditInfo | null) => void) | null = null;
  /** Set by GameCanvas: fired whenever the active tool changes, including the automatic revert to "select" after a shape commits — see currentTool. */
  onToolChange: ((tool: CollisionTool) => void) | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    scene.input.on("pointermove", this.handlePointerMove, this);
    scene.input.on("pointerdown", this.handleCanvasPointerDown, this);
    scene.input.on("pointerup", this.handlePointerUp, this);
    scene.input.on("drag", this.handleDrag, this);
    scene.input.on("dragstart", this.handleDragStart, this);
    scene.input.on("dragend", this.handleDragEnd, this);
    // Only scales the selected item while the pointer is over it, so it
    // doesn't fight StudioScene's own wheel-zoom handler on every scroll —
    // ponytail: the two still both fire when hovering a selected item during
    // edit mode (camera zooms a little *and* the item scales); harmless in a
    // dev-only tool, not worth touching the camera code to fully separate.
    scene.input.on("wheel", this.handleWheel, this);
    scene.input.keyboard?.on("keydown-R", this.handleRotateKey, this);
    scene.input.keyboard?.on("keydown-DELETE", this.handleDeleteKey, this);
    scene.input.keyboard?.on("keydown-BACKSPACE", this.handleDeleteKey, this);
    scene.input.keyboard?.on("keydown-ESC", this.handleEscapeKey, this);
  }

  /** Called by StudioScene's Space+drag camera pan around its start/end — see the field's own comment. */
  setInputSuspended(suspended: boolean): void {
    this.inputSuspended = suspended;
  }

  /** Opens/closes the Place (furniture placement) tool — mutually exclusive with the Collision Editor, see setCollisionActive. */
  setActive(active: boolean): void {
    this.active = active;
    if (active && this.collisionActive) this.setCollisionActive(false);
    if (!active) {
      this.cancelPlacement();
      this.select(null);
    }
  }

  /** Opens/closes the Collision Editor — mutually exclusive with Place mode, so collision editing can never also drag/place/resize furniture. Closing tears down its selection/drawing state and restores normal game input the instant it's called (see GameCanvas's close handler). */
  setCollisionActive(active: boolean): void {
    if (this.collisionActive === active) return;
    this.collisionActive = active;
    if (active && this.active) this.setActive(false);
    if (!active) this.endCollisionEdit();
  }

  /** Called by the sidebar when a thumbnail is clicked: arms a ghost that follows the pointer until the next canvas click. */
  beginPlacement(kind: string): void {
    if (!this.active) return;
    this.cancelPlacement();
    this.pendingKind = kind;
    this.ghost = this.scene.add.image(0, 0, resolveEditorTextureKey(kind)).setOrigin(0.5, originYFor(kind)).setAlpha(0.6).setDepth(4000);
    this.applyScale(this.ghost, kind, 1);
  }

  /**
   * Reads the three editor-data files back out of the Phaser loader cache
   * (populated by preloadFurnitureEditorData, guaranteed ready by the time
   * create() runs — same guarantee every preloaded sprite already gets) and
   * spawns every layout item. Call once at scene boot, after
   * preloadFurnitureEditorData ran in preload().
   */
  load(): void {
    const layout = this.scene.cache.json.get(LAYOUT_CACHE_KEY) as unknown;
    const collisionShapes = this.scene.cache.json.get(COLLISION_SHAPES_CACHE_KEY) as CollisionShapeMap | undefined;
    const instanceCollisionShapes = this.scene.cache.json.get(INSTANCE_COLLISION_SHAPES_CACHE_KEY) as Record<string, Point[][]> | undefined;

    Object.assign(this.collisionShapes, collisionShapes ?? {});
    for (const [id, shapes] of Object.entries(instanceCollisionShapes ?? {})) this.instanceCollisionShapes.set(id, shapes);

    if (Array.isArray(layout)) {
      for (const entry of layout) {
        if (isFurnitureEditorItem(entry)) this.spawn(entry);
      }
    }
  }

  /**
   * Solid collision footprints (world px) for ONE placed item: its own saved
   * shape if it has one, else its kind's shared shape, else the legacy
   * auto-guessed footprint. That last fallback matters — a piece with NO
   * collision at all is ghost furniture Mimi walks straight through, which is
   * worse than an approximate box. "Show Collision" draws fallbacks amber
   * rather than cyan, so an un-authored piece is obvious.
   */
  private itemFootprintPolygons(item: PlacedItem): FootprintPolygon[] {
    const instanceOverride = this.instanceCollisionShapes.get(item.id);
    const authored = instanceOverride && instanceOverride.length > 0 ? instanceOverride : this.collisionShapes[canonicalKind(item.kind)];
    if (authored && authored.length > 0) {
      const bw = baseDisplayWidth(item.kind);
      return computeItemFootprintPolygons(item, authored, bw).map((points) => ({ points, authored: true }));
    }
    const obb = computeFootprintObb(item);
    return [{ points: obbToPolygon(obb.cx, obb.cy, obb.halfW, obb.halfH, obb.angleDeg), authored: false }];
  }

  /**
   * Solid collision footprints (world px) for every currently spawned item.
   * Recomputed live every call so it always reflects current
   * position/rotation/scale, including mid-drag/rotate/resize.
   */
  footprintPolygons(): FootprintPolygon[] {
    const result: FootprintPolygon[] = [];
    for (const item of this.items.values()) {
      result.push(...this.itemFootprintPolygons(item));
    }
    return result;
  }

  /**
   * Render order for one placed piece, from the CENTRE OF ITS COLLISION
   * FOOTPRINT rather than from item.x/item.y.
   *
   * item.x/y is where the sprite's declared anchor (origin 0.5/1, i.e. the
   * image's bottom-centre) lands — and on these assets that point is nowhere
   * near the object's real base. Most furniture PNGs carry transparent margin
   * below/right of the actual object, and the base of an iso sprite is a
   * diamond whose lowest pixel is off to one side, so the anchor typically
   * sits well SOUTH-EAST of the piece's own footprint (the sofa's is +17x
   * +9y clear of it). Depth-sorting on that biased point made furniture win
   * against Mimi even when she was standing squarely in front of it: she
   * vanished behind the sofa/TV/wardrobe/bookshelf and read as being "inside"
   * them. pc and kitchen looked right only because they're the two kinds with
   * a hand-corrected ORIGIN_Y_BY_KIND entry, which happens to pull their
   * anchors back onto their bases.
   *
   * The footprint centre is used rather than its front corner: for a body
   * against any one of a rectangular footprint's four faces the centre sorts
   * it the right way round, where a front-corner key fails for every piece
   * wider than Mimi.
   *
   * This still only orders furniture against furniture. No single scalar per
   * sprite can express iso occlusion for a body moving among them (a spot far
   * north-east of a piece is genuinely in front of it, yet has a small x+y) —
   * checked across the whole walkable floor, the best scalar still mis-sorts
   * ~160 standing positions, which is what left Mimi hidden behind the kitchen
   * and the dressing table. Mimi's own depth is therefore resolved against
   * these values pairwise every frame instead; see bodyRenderDepth.
   */
  private footprintDepth(item: PlacedItem): number {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { points } of this.itemFootprintPolygons(item)) {
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (!Number.isFinite(minX)) return visualDepth(item.x, item.y);
    return visualDepth((minX + maxX) / 2, (minY + maxY) / 2);
  }

  /** Reapplies footprintDepth() — call after anything that moves, resizes or reshapes a piece. */
  private applyDepth(item: PlacedItem): void {
    item.image.setDepth(this.footprintDepth(item));
  }

  /**
   * Render depth for Mimi, resolved against the furniture she's actually
   * standing among instead of from her position alone.
   *
   * A single depth number per sprite can't express isometric occlusion. The
   * real rule between two floor footprints A and B is "A draws in front iff
   * A is entirely east of B, or entirely south of B" — two independent axis
   * tests, which no scalar ordering reproduces. Sorting everything by x+y is
   * only an approximation of it, and it breaks worst exactly where a piece
   * wraps a corner: standing in the mouth of the L-shaped kitchen counter she
   * is east of its west run AND south of its north run, so she is genuinely
   * in front of the whole thing, yet her x+y sits below the counter's however
   * that counter's key is chosen. Same for the dressing table. That's why she
   * still vanished behind those two after the footprint-centre fix.
   *
   * So: apply the real rule per piece, then pick a depth that satisfies it.
   * Only pieces whose sprite actually overlaps hers on screen are considered
   * — order is unobservable otherwise, and ignoring distant pieces keeps the
   * adjustment small and local. Where the constraints conflict (a genuinely
   * ambiguous, interleaved spot) being drawn in front wins, because appearing
   * on top of something reads as a much milder glitch than disappearing.
   */
  bodyRenderDepth(bodyCx: number, bodyCy: number, halfW: number, halfH: number, bodySprite: Phaser.GameObjects.Sprite, fallback: number): number {
    const x0 = bodyCx - halfW;
    const x1 = bodyCx + halfW;
    const y0 = bodyCy - halfH;
    const y1 = bodyCy + halfH;
    bodySprite.getBounds(this.bodyBounds);

    let mustOutDraw = -Infinity; // highest depth she has to beat
    let mustBeUnder = Infinity; // lowest depth that has to beat her

    for (const item of this.items.values()) {
      item.image.getBounds(this.itemBounds);
      if (!Phaser.Geom.Rectangle.Overlaps(this.bodyBounds, this.itemBounds)) continue;

      let inFront = true;
      let behind = true;
      for (const { points } of this.itemFootprintPolygons(item)) {
        let rx0 = Infinity;
        let ry0 = Infinity;
        let rx1 = -Infinity;
        let ry1 = -Infinity;
        for (const p of points) {
          if (p.x < rx0) rx0 = p.x;
          if (p.x > rx1) rx1 = p.x;
          if (p.y < ry0) ry0 = p.y;
          if (p.y > ry1) ry1 = p.y;
        }
        if (!(x0 >= rx1 || y0 >= ry1)) inFront = false;
        if (!(x1 <= rx0 || y1 <= ry0)) behind = false;
        if (!inFront && !behind) break;
      }
      if (inFront === behind) continue; // interleaved — no usable constraint

      const depth = item.image.depth;
      if (inFront) {
        if (depth > mustOutDraw) mustOutDraw = depth;
      } else if (depth < mustBeUnder) {
        mustBeUnder = depth;
      }
    }

    let depth = fallback;
    if (depth >= mustBeUnder) depth = mustBeUnder - DEPTH_NUDGE;
    if (depth <= mustOutDraw) depth = mustOutDraw + DEPTH_NUDGE; // applied last: in front wins a conflict
    return depth;
  }

  /**
   * Serializes every placed item's world x/y/rotation/scale AND every kind's
   * authored collision shapes, persisting both as the project's defaults
   * (game/data/furnitureLayout.json + game/data/furnitureCollisionShapes.json,
   * via their dev-only save API routes) — one Save action, two files, the
   * same pair load()/collisionShapes read on next boot. Throws on failure so
   * the sidebar can surface it.
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
    const [layoutResponse, shapesResponse] = await Promise.all([
      fetch(SAVE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
      fetch(SAVE_COLLISION_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.collisionShapes),
      }),
    ]);
    if (!layoutResponse.ok) throw new Error(`Save failed (${layoutResponse.status})`);
    if (!shapesResponse.ok) throw new Error(`Collision shape save failed (${shapesResponse.status})`);
  }

  /**
   * Persists every placed item's own collision override (in-memory
   * instanceCollisionShapes) to disk in one action — the Collision Editor's
   * single Save button, covering every piece touched this session, not just
   * whichever one is currently selected. Reuses the same upsert-one-item
   * endpoint save() also uses for a single instance (see the API route's
   * write-queue serialization), just called once per touched item.
   */
  async saveAllInstanceCollisions(): Promise<void> {
    const entries = Array.from(this.instanceCollisionShapes.entries());
    const responses = await Promise.all(
      entries.map(([itemId, shapes]) =>
        fetch(SAVE_INSTANCE_COLLISION_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, shapes }),
        }),
      ),
    );
    if (responses.some((r) => !r.ok)) throw new Error("Collision save failed");
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
    image.setInteractive({ draggable: true, useHandCursor: true });

    const item: PlacedItem = { ...data, image, baseScale };
    this.items.set(data.id, item);
    this.applyDepth(item); // needs `item`, so it can't happen before this point

    image.on("pointerdown", (_pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
      if (this.inputSuspended) return;
      if (this.collisionActive) {
        // Just records the hit — handleCollisionPointerDown (the scene-wide
        // handler, which always fires right after this) is the one place
        // that decides what a click actually does, so shape hits and
        // sprite hits can't race for the same click. Phaser's default
        // topOnly input means at most one item's handler runs per click.
        if (this.isOpaqueAt(image, localX, localY)) this.lastOpaqueHitId = item.id;
        return;
      }
      this.select(item.id);
    });
  }

  /**
   * True if (localX, localY) — the pointer's position local to `image`, as
   * Phaser hands it to a pointerdown listener — lands on a non-transparent
   * pixel of its texture. Furniture PNGs carry large transparent margins (see
   * the MEASURED_FOOTPRINTS doc comment), so neighboring pieces' plain
   * bounding-box hit areas overlap heavily in a furnished room; without this
   * check, clicking visibly on one piece while editing another can silently
   * hijack the edit target to whichever unrelated neighbor's invisible margin
   * happens to extend under the pointer. Scoped to just that one decision —
   * Place mode's drag-grab (and everything else) keeps the original forgiving
   * bounding-box hit area untouched.
   */
  private isOpaqueAt(image: Phaser.GameObjects.Image, localX: number, localY: number): boolean {
    const alpha = this.scene.textures.getPixelAlpha(Math.round(localX), Math.round(localY), image.texture.key, image.frame.name);
    return alpha !== null && alpha > 0;
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
    this.applyDepth(item); // the footprint scaled with it, so its centre moved
    this.notifySelection();
  }

  private cancelPlacement(): void {
    this.pendingKind = null;
    this.ghost?.destroy();
    this.ghost = null;
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.inputSuspended) return;
    if (this.collisionActive) {
      if (!this.editingInstanceId) return;
      const floor = unproject(pointer.worldX, pointer.worldY);
      this.lastPointerFloor = floor;
      if (this.draggingShapeIndex !== null && this.shapeDragLast) {
        const dx = floor.x - this.shapeDragLast.x;
        const dy = floor.y - this.shapeDragLast.y;
        if (dx !== 0 || dy !== 0) {
          if (!this.shapeDragSnapshotPushed) {
            this.pushUndoSnapshot();
            this.shapeDragSnapshotPushed = true;
          }
          this.moveShapeBy(this.draggingShapeIndex, dx, dy);
          this.shapeDragLast = floor;
          this.rebuildVertexHandles();
        }
        return;
      }
      this.redrawShapes();
      return;
    }
    if (!this.active || !this.ghost) return;
    this.ghost.setPosition(pointer.worldX, pointer.worldY);
  }

  /**
   * True unless `pointer`'s underlying DOM event fired on some element other
   * than the game canvas. Phaser's MouseManager deliberately also listens on
   * `window` for mousedown/mouseup (so a drag that ends outside the canvas
   * still releases cleanly) and forwards those into the exact same
   * `scene.input` pointerdown/pointerup stream — so clicking a sidebar
   * button while Draw Collision is armed fires a real pointerdown/up here
   * too, at that button's screen position translated into a bogus world
   * point. Every entry point that can START a new action (a polygon point,
   * a rect drag, a placement drop) must check this first, or clicking the
   * sidebar silently appends a stray vertex or drops a ghost out toward it.
   */
  private isPointerFromCanvas(pointer: Phaser.Input.Pointer): boolean {
    const target = pointer.event?.target;
    return !target || target === this.scene.sys.game.canvas;
  }

  /** Drops a pending ghost at the clicked point; does nothing if no placement is armed (so it never interferes with normal item selection/drag clicks). */
  private handleCanvasPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.inputSuspended || !this.isPointerFromCanvas(pointer)) return;
    if (this.collisionActive) {
      this.handleCollisionPointerDown(pointer);
      return;
    }
    if (!this.active || !this.pendingKind) return;
    const kind = this.pendingKind;
    this.cancelPlacement();
    this.dropItemAt(kind, pointer.worldX, pointer.worldY);
  }

  /**
   * Collision mode's click handler — the one place that decides what a
   * click does, in priority order: (1) a shape belonging to whatever's
   * already the edit target (cheapest, keeps working the same piece fast),
   * (2) any OTHER item's resolved collision anywhere in the house — this is
   * "clicking any existing collision selects it", the direct replacement
   * for the old asset-list picker, (3) a real furniture sprite with no
   * shape drawn yet (see lastOpaqueHitId, set by spawn()'s pointerdown just
   * before this runs), which becomes the new edit target ready to draw on,
   * (4) empty floor: starts a new shape if a target + draw tool are both
   * active, otherwise clears the selection.
   */
  private handleCollisionPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.collisionActive) return;
    const floor = unproject(pointer.worldX, pointer.worldY);
    const opaqueHitId = this.lastOpaqueHitId;
    this.lastOpaqueHitId = null;

    if (this.editingInstanceId) {
      const shapes = this.currentShapes() ?? [];
      for (let i = shapes.length - 1; i >= 0; i--) {
        if (pointInPolygon(floor, this.shapeWorldPoints(shapes[i]))) {
          this.setToolInternal("select");
          this.selectShape(i);
          this.draggingShapeIndex = i;
          this.shapeDragLast = floor;
          this.shapeDragSnapshotPushed = false;
          return;
        }
      }
    }

    const globalHit = this.hitTestAnyCollision(floor);
    if (globalHit) {
      this.setToolInternal("select");
      this.beginInstanceCollisionEdit(globalHit.itemId);
      this.selectShape(globalHit.shapeIndex);
      this.draggingShapeIndex = globalHit.shapeIndex;
      this.shapeDragLast = floor;
      this.shapeDragSnapshotPushed = false;
      return;
    }

    if (opaqueHitId && opaqueHitId !== this.editingInstanceId) {
      this.setToolInternal("select");
      this.beginInstanceCollisionEdit(opaqueHitId);
      return;
    }

    if (this.editingInstanceId && this.currentTool !== "select") {
      if (this.currentTool === "rect") this.rectDragStart = floor;
      else this.drawingPoints = [...(this.drawingPoints ?? []), floor];
      this.redrawShapes();
      return;
    }

    this.selectShape(null);
  }

  /**
   * Every placed item's currently-effective world-space collision polygons
   * (own override, else its kind's default), hit-tested against `floor` —
   * the global "clicking any existing collision selects it" scan. Skips
   * whichever item is already the edit target (handleCollisionPointerDown's
   * own faster first-pass check already covers it). Insertion-order
   * tie-break for overlapping footprints — good enough for a house-sized
   * furniture count, not worth depth-sorting.
   */
  private hitTestAnyCollision(floor: Point): { itemId: string; shapeIndex: number } | null {
    for (const item of this.items.values()) {
      if (item.id === this.editingInstanceId) continue;
      const canonical = canonicalKind(item.kind);
      const override = this.instanceCollisionShapes.get(item.id);
      const authored = override && override.length > 0 ? override : this.collisionShapes[canonical];
      if (!authored || authored.length === 0) continue;
      const bw = baseDisplayWidth(item.kind);
      const basis: FootprintItem = { x: item.x, y: item.y, rotation: item.rotation, scale: item.scale };
      const worldPolygons = computeItemFootprintPolygons(basis, authored, bw);
      for (let i = worldPolygons.length - 1; i >= 0; i--) {
        if (pointInPolygon(floor, worldPolygons[i])) return { itemId: item.id, shapeIndex: i };
      }
    }
    return null;
  }

  /**
   * Commits a rectangle drag (click-drag corner to corner) as a new shape —
   * requires a real minimum size so a barely-moved click can't leave a
   * sliver shape behind (see addShape's own zero-area guard too). Releases
   * any in-progress whole-shape drag. A release that didn't actually happen
   * on the canvas (see isPointerFromCanvas — e.g. the mouseup landed on a
   * sidebar button while a drag was in progress) still cancels the drag
   * cleanly, it just never commits a shape built from that bogus position.
   */
  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.inputSuspended) return;
    if (this.collisionActive && this.editingInstanceId && this.rectDragStart) {
      const start = this.rectDragStart;
      this.rectDragStart = null;
      if (this.isPointerFromCanvas(pointer)) {
        const end = unproject(pointer.worldX, pointer.worldY);
        if (Math.abs(end.x - start.x) > MIN_SHAPE_SIZE_PX && Math.abs(end.y - start.y) > MIN_SHAPE_SIZE_PX) {
          this.addShape([
            { x: start.x, y: start.y },
            { x: end.x, y: start.y },
            { x: end.x, y: end.y },
            { x: start.x, y: end.y },
          ]);
        }
      }
      this.redrawShapes();
    }
    this.draggingShapeIndex = null;
    this.shapeDragLast = null;
  }

  /** Pushes the pre-drag undo snapshot for a vertex-handle drag, once, the moment Phaser recognizes it as a real drag (past its own built-in threshold) — so a plain click on a handle with no movement never eats an undo step. */
  private handleDragStart(_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject): void {
    if (this.collisionActive && gameObject.getData("vertex")) this.pushUndoSnapshot();
  }

  /** Rebuilds vertex handles once a Phaser-managed drag (a vertex handle) finishes — done here rather than mid-drag so the handle being dragged is never destroyed out from under Phaser's own drag state. */
  private handleDragEnd(_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject): void {
    if (this.collisionActive && gameObject.getData("vertex")) this.rebuildVertexHandles();
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

  private handleDrag(_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number): void {
    if (this.inputSuspended) return;
    if (this.collisionActive) {
      const vertex = gameObject.getData("vertex") as { shapeIndex: number; pointIndex: number } | undefined;
      if (!vertex || !this.editingInstanceId) return;
      const floor = unproject(dragX, dragY);
      const bw = baseDisplayWidth(this.editingKind!);
      const point = this.currentShapes()?.[vertex.shapeIndex]?.[vertex.pointIndex];
      if (!point) return;
      const local = worldPointToLocal(floor, this.editBasis(), bw);
      point.x = local.x;
      point.y = local.y;
      (gameObject as Phaser.GameObjects.Arc).setPosition(dragX, dragY);
      this.redrawShapes();
      return;
    }
    if (!this.active) return;
    const item = this.findByImage(gameObject as Phaser.GameObjects.Image);
    if (!item) return;
    const dragged = unproject(dragX, dragY);
    const { x, y } = clampToRoomFloor(dragged.x, dragged.y);
    const anchor = project(x, y);
    (gameObject as Phaser.GameObjects.Image).setPosition(anchor.x, anchor.y);
    item.x = x;
    item.y = y;
    this.applyDepth(item);
  }

  private handleWheel(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[], _dx: number, deltaY: number): void {
    if (this.collisionActive || !this.active || !this.selectedId) return;
    const item = this.items.get(this.selectedId);
    if (!item || !currentlyOver.includes(item.image)) return;
    item.scale = Phaser.Math.Clamp(item.scale - Math.sign(deltaY) * SCALE_STEP, SCALE_MIN, SCALE_MAX);
    this.applyScale(item.image, item.kind, item.scale);
    this.applyDepth(item);
    this.notifySelection();
  }

  private handleRotateKey(): void {
    if (this.collisionActive || !this.active || !this.selectedId) return;
    const item = this.items.get(this.selectedId);
    if (!item) return;
    item.rotation = (item.rotation + ROTATE_STEP_DEG) % 360;
    item.image.setAngle(item.rotation);
    this.applyDepth(item);
  }

  private handleDeleteKey(): void {
    if (this.collisionActive) {
      this.deleteSelectedShape();
      return;
    }
    if (!this.active || !this.selectedId) return;
    const item = this.items.get(this.selectedId);
    if (!item) return;
    item.image.destroy();
    this.items.delete(item.id);
    this.select(null);
  }

  /** Cancels whatever collision shape is mid-draw (a rectangle drag still held, or polygon points already clicked) without committing it — so pressing Escape can always back out of a draw instead of it accidentally landing as a shape. */
  private handleEscapeKey(): void {
    if (!this.collisionActive || (!this.rectDragStart && !this.drawingPoints)) return;
    this.rectDragStart = null;
    this.drawingPoints = null;
    this.redrawShapes();
  }

  private findByImage(image: Phaser.GameObjects.Image): PlacedItem | undefined {
    for (const item of this.items.values()) if (item.image === image) return item;
    return undefined;
  }

  // --- Collision-shape editing (collisionActive) ---

  /**
   * Enters collision-shape editing for one already-placed instance, directly
   * in its real world position/rotation/scale — no preview sprite, always
   * the real placed piece. The instance's editing buffer is seeded from
   * whatever currently determines its actual collision (its own saved
   * override, else its kind's shared default, else the legacy auto-guessed
   * footprint — see currentEffectiveLocalShapes) the first time it's
   * opened, so the shown footprint always matches what's really colliding
   * right now; reselecting the same instance later in this session reuses
   * whatever's already in the buffer instead of re-seeding over in-progress
   * edits. Undo history starts empty for every switch, so it never carries
   * stray steps over from the last item.
   */
  private beginInstanceCollisionEdit(itemId: string): void {
    if (!this.collisionActive) return;
    const item = this.items.get(itemId);
    if (!item) return;
    this.teardownCollisionUi();
    this.editingKind = canonicalKind(item.kind);
    this.editingInstanceId = itemId;
    if (!this.instanceCollisionShapes.has(itemId)) {
      this.instanceCollisionShapes.set(itemId, this.currentEffectiveLocalShapes(item));
    }
    item.image.setTint(SELECTED_TINT);
    this.editingInstanceTintedImage = item.image;
    this.shapesGraphics = this.scene.add.graphics().setDepth(4050);
    this.rebuildVertexHandles();
  }

  /** Tears down the shape graphics and vertex handles for whichever instance is currently being edited, without touching editingKind/editingInstanceId themselves — shared by beginInstanceCollisionEdit (switching target) and endCollisionEdit (leaving Collision mode entirely). */
  private teardownCollisionUi(): void {
    if (this.editingInstanceTintedImage) {
      this.editingInstanceTintedImage.clearTint();
      this.editingInstanceTintedImage = null;
    }
    this.shapesGraphics?.destroy();
    this.shapesGraphics = null;
    this.destroyVertexHandles();
    this.drawingPoints = null;
    this.rectDragStart = null;
    this.draggingShapeIndex = null;
    this.shapeDragLast = null;
    this.selectedShapeIndex = null;
    this.focusedShapeIndex = null;
    this.currentTool = "select";
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Leaves collision editing entirely (deactivating the Collision Editor, or clicking empty floor with no target active) — no-op if nothing is being edited. */
  private endCollisionEdit(): void {
    this.teardownCollisionUi();
    this.editingKind = null;
    this.editingInstanceId = null;
    this.onCollisionShapesChange?.(null);
  }

  /** Switches the active tool — Select/Edit (click-to-select, drag to move, drag a vertex to resize), Draw Rectangle, or Draw Polygon. Clears any shape mid-draw so a stray rectangle-drag or polygon click can't get finished under a different tool. */
  setTool(tool: CollisionTool): void {
    this.setToolInternal(tool);
    this.rectDragStart = null;
    this.drawingPoints = null;
    this.redrawShapes();
  }

  /** Sets currentTool and notifies onToolChange — the one path both the public setTool() and addShape's auto-revert-to-select go through, so the panel's tool buttons always reflect reality even when the switch happens implicitly. */
  private setToolInternal(tool: CollisionTool): void {
    if (this.currentTool === tool) return;
    this.currentTool = tool;
    this.onToolChange?.(tool);
  }

  /** Closes the in-progress polygon (see handleCollisionPointerDown) as a new shape — the sidebar's "Finish Polygon" button, since a click-driven point list has no natural "last click" to auto-close on. Needs at least 3 points and a non-trivial area (see addShape); anything less just cancels the in-progress polygon. */
  finishPolygon(): void {
    const points = this.drawingPoints;
    this.drawingPoints = null;
    if (points && points.length >= 3) this.addShape(points);
    else this.redrawShapes();
  }

  /** Removes the shape currently selected (click a shape to select it) — the panel's "Delete" button and the Delete/Backspace key. No-op with nothing selected. */
  deleteSelectedShape(): void {
    if (!this.editingInstanceId || this.selectedShapeIndex === null) return;
    const shapes = this.currentShapes();
    if (!shapes || !shapes[this.selectedShapeIndex]) return;
    this.pushUndoSnapshot();
    shapes.splice(this.selectedShapeIndex, 1);
    this.selectedShapeIndex = null;
    this.focusedShapeIndex = null;
    this.rebuildVertexHandles();
  }

  /** Wipes every shape for the item being edited in one click — the panel's "Clear All" button. Undo restores it all in one step, so this is safe to use freely rather than deleting shapes one at a time. */
  clearAllCollision(): void {
    if (!this.editingInstanceId) return;
    const shapes = this.currentShapes();
    if (!shapes || shapes.length === 0) return;
    this.pushUndoSnapshot();
    shapes.length = 0;
    this.selectedShapeIndex = null;
    this.focusedShapeIndex = null;
    this.rebuildVertexHandles();
  }

  undo(): void {
    if (!this.editingInstanceId || this.undoStack.length === 0) return;
    this.redoStack.push(structuredClone(this.currentShapes() ?? []));
    this.replaceCurrentShapes(this.undoStack.pop()!);
    this.selectedShapeIndex = null;
    this.focusedShapeIndex = null;
    this.rebuildVertexHandles();
  }

  redo(): void {
    if (!this.editingInstanceId || this.redoStack.length === 0) return;
    this.undoStack.push(structuredClone(this.currentShapes() ?? []));
    this.replaceCurrentShapes(this.redoStack.pop()!);
    this.selectedShapeIndex = null;
    this.focusedShapeIndex = null;
    this.rebuildVertexHandles();
  }

  /** Snapshots the current edit target's shape array onto the undo stack (capped so it can't grow unbounded across a long editing session) and invalidates redo — call BEFORE a mutation, never after. */
  private pushUndoSnapshot(): void {
    if (!this.editingInstanceId) return;
    this.undoStack.push(structuredClone(this.currentShapes() ?? []));
    if (this.undoStack.length > UNDO_HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  /** The current edit target's shape array — the one place every mutation method goes through instead of reading instanceCollisionShapes directly. */
  private currentShapes(): Point[][] | undefined {
    return this.editingInstanceId ? this.instanceCollisionShapes.get(this.editingInstanceId) : undefined;
  }

  /** Replaces the current edit target's whole shape array (undo/redo's own path — every other mutation edits the array returned by currentShapes() in place). */
  private replaceCurrentShapes(shapes: Point[][]): void {
    if (this.editingInstanceId) this.instanceCollisionShapes.set(this.editingInstanceId, shapes);
  }

  /** The real placed item's own transform — collision-edit math places every shape relative to this. */
  private editBasis(): FootprintItem {
    const item = this.editingInstanceId ? this.items.get(this.editingInstanceId) : undefined;
    return item ? { x: item.x, y: item.y, rotation: item.rotation, scale: item.scale } : { x: 0, y: 0, rotation: 0, scale: 1 };
  }

  /**
   * The local (fraction-of-baseWidth) shape polygons that currently determine
   * `item`'s real collision: its own saved override if it has one, else its
   * kind's shared authored shape, else the legacy auto-guessed footprint
   * (computeFootprintObb) converted into item's own local frame via the exact
   * inverse transform. Used to seed a fresh instance-edit session so what's
   * shown/edited always starts as exactly what's colliding right now — never
   * a blank canvas for a piece that already collides via inheritance.
   */
  private currentEffectiveLocalShapes(item: PlacedItem): Point[][] {
    const override = this.instanceCollisionShapes.get(item.id);
    if (override && override.length > 0) return structuredClone(override);
    const canonical = canonicalKind(item.kind);
    const authored = this.collisionShapes[canonical];
    if (authored && authored.length > 0) return structuredClone(authored);
    const obb = computeFootprintObb(item);
    const bw = baseDisplayWidth(item.kind);
    const basis: FootprintItem = { x: item.x, y: item.y, rotation: item.rotation, scale: item.scale };
    const localPoints = obbToPolygon(obb.cx, obb.cy, obb.halfW, obb.halfH, obb.angleDeg).map((p) => worldPointToLocal(p, basis, bw));
    return [localPoints];
  }

  /**
   * Selects shape `index` (or clears selection for null) — click a shape to
   * select it, so it's obvious which one Delete Selected Shape / Delete
   * Backspace will remove (see redrawShapes' highlight). A second click on
   * the same shape within DOUBLE_CLICK_MS toggles it "focused": every other
   * shape dims and hides its vertex handles (see rebuildVertexHandles/
   * redrawShapes), making one shape easy to isolate on cluttered furniture.
   */
  private selectShape(index: number | null): void {
    const now = performance.now();
    if (index !== null && index === this.lastClickShapeIndex && now - this.lastClickTime < DOUBLE_CLICK_MS) {
      this.focusedShapeIndex = this.focusedShapeIndex === index ? null : index;
    }
    this.lastClickShapeIndex = index;
    this.lastClickTime = now;
    this.selectedShapeIndex = index;
    if (index === null) this.focusedShapeIndex = null;
    this.rebuildVertexHandles();
  }

  /**
   * Converts world floor-space points to the editing kind's stored local
   * fraction-of-baseWidth points (see CollisionShapeMap's doc comment),
   * pushes an undo snapshot, and appends them as a new shape — unless the
   * points are degenerate (near-zero area, e.g. a barely-dragged rectangle
   * or a straight-line polygon), which is silently dropped rather than
   * saved as an invisible sliver shape.
   */
  private addShape(worldPoints: readonly Point[]): void {
    if (!this.editingInstanceId || polygonArea(worldPoints) < MIN_SHAPE_AREA_PX2) return;
    this.pushUndoSnapshot();
    const bw = baseDisplayWidth(this.editingKind!);
    const basis = this.editBasis();
    const local = worldPoints.map((p) => worldPointToLocal(p, basis, bw));
    let shapes = this.currentShapes();
    if (!shapes) {
      shapes = [];
      this.replaceCurrentShapes(shapes);
    }
    shapes.push(local);
    this.selectedShapeIndex = shapes.length - 1;
    this.setToolInternal("select");
    this.rebuildVertexHandles();
  }

  /** Translates every point of one shape by a world-space delta, converted through the edit target's own rotation/scale basis (identity for a kind's unrotated/scale-1 preview, the real transform for an instance) — the whole-shape drag path from handlePointerMove. */
  private moveShapeBy(shapeIndex: number, dxWorld: number, dyWorld: number): void {
    const shape = this.currentShapes()?.[shapeIndex];
    if (!shape) return;
    const bw = baseDisplayWidth(this.editingKind!);
    const basis = this.editBasis();
    const rad = (basis.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const scale = bw * basis.scale;
    // Same rotation-inverse as worldPointToLocal, but for a delta vector (no basis position to subtract).
    const dx = (dxWorld * cos + dyWorld * sin) / scale;
    const dy = (-dxWorld * sin + dyWorld * cos) / scale;
    for (const p of shape) {
      p.x += dx;
      p.y += dy;
    }
  }

  /** The edit target's local (fraction-of-baseWidth) shape points, transformed to world floor-space through the real placed item's current basis (see editBasis) — the same transform computeItemFootprintPolygons applies everywhere else. */
  private shapeWorldPoints(shape: readonly Point[]): Point[] {
    const bw = baseDisplayWidth(this.editingKind!);
    return computeItemFootprintPolygons(this.editBasis(), [shape as Point[]], bw)[0];
  }

  /**
   * Destroys and recreates every vertex-handle circle from the current shape
   * data, then redraws the shape outlines and fires onCollisionShapesChange —
   * the one place both happen together, so every mutation path just calls
   * this instead of remembering to notify separately. Called after any
   * shape-data mutation that isn't itself a live Phaser drag on a handle
   * (which repositions its own handle directly — see handleDrag — to avoid
   * destroying the object mid-drag). Large, generously-hit-tested circles
   * (VERTEX_RADIUS_PX drawn, VERTEX_HIT_RADIUS_PX grabbable) so a vertex is
   * easy to grab without precision aiming. A focused shape (see selectShape)
   * hides every other shape's handles to cut clutter.
   */
  private rebuildVertexHandles(): void {
    this.destroyVertexHandles();
    if (this.editingInstanceId) {
      for (const [shapeIndex, shape] of (this.currentShapes() ?? []).entries()) {
        if (this.focusedShapeIndex !== null && this.focusedShapeIndex !== shapeIndex) continue;
        const color = shapeIndex === this.selectedShapeIndex ? 0xffffff : 0xffe9a8;
        for (const [pointIndex, worldPt] of this.shapeWorldPoints(shape).entries()) {
          const screenPt = project(worldPt.x, worldPt.y);
          const handle = this.scene.add.circle(screenPt.x, screenPt.y, VERTEX_RADIUS_PX, color).setStrokeStyle(2, 0x1e1730).setDepth(4100);
          handle.setInteractive(new Phaser.Geom.Circle(0, 0, VERTEX_HIT_RADIUS_PX), Phaser.Geom.Circle.Contains);
          this.scene.input.setDraggable(handle);
          handle.input!.cursor = "grab";
          handle.setData("vertex", { shapeIndex, pointIndex });
          this.vertexHandles.push(handle);
        }
      }
    }
    this.redrawShapes();
    this.notifyCollisionShapesChange();
  }

  private destroyVertexHandles(): void {
    for (const handle of this.vertexHandles) handle.destroy();
    this.vertexHandles = [];
  }

  /** Redraws committed shapes for the editing kind plus whatever's mid-draw (a growing polygon outline, or a live rectangle-drag preview). The selected shape gets a brighter, thicker outline; every shape but the focused one (if any) is dimmed. A light fill keeps the furniture underneath clearly visible. Doesn't touch vertex handles — see rebuildVertexHandles. */
  private redrawShapes(): void {
    if (!this.shapesGraphics || !this.editingInstanceId) return;
    const g = this.shapesGraphics;
    g.clear();

    const shapes = this.currentShapes() ?? [];
    shapes.forEach((shape, index) => {
      const isSelected = index === this.selectedShapeIndex;
      const isDimmed = this.focusedShapeIndex !== null && this.focusedShapeIndex !== index;
      const color = isSelected ? 0xffffff : 0x8fd0ff;
      g.lineStyle(isSelected ? 3 : 2, color, isDimmed ? 0.3 : 1);
      g.fillStyle(color, isDimmed ? 0.06 : isSelected ? 0.32 : 0.16);
      this.strokeScreenPolygon(g, this.shapeWorldPoints(shape).map((p) => project(p.x, p.y)));
    });

    if (this.drawingPoints && this.drawingPoints.length > 0) {
      g.lineStyle(2, 0xffe9a8, 1);
      const screenPts = [...this.drawingPoints, this.lastPointerFloor].map((p) => project(p.x, p.y));
      g.beginPath();
      g.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) g.lineTo(screenPts[i].x, screenPts[i].y);
      g.strokePath();
    }

    if (this.rectDragStart) {
      const s = this.rectDragStart;
      const e = this.lastPointerFloor;
      const corners: Point[] = [
        { x: s.x, y: s.y },
        { x: e.x, y: s.y },
        { x: e.x, y: e.y },
        { x: s.x, y: e.y },
      ];
      g.lineStyle(2, 0xffe9a8, 1);
      g.fillStyle(0xffe9a8, 0.12);
      this.strokeScreenPolygon(g, corners.map((p) => project(p.x, p.y)));
    }
  }

  private strokeScreenPolygon(g: Phaser.GameObjects.Graphics, screenPoints: readonly Point[]): void {
    if (screenPoints.length < 2) return;
    g.beginPath();
    g.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i++) g.lineTo(screenPoints[i].x, screenPoints[i].y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  /** Fires onCollisionShapesChange with the edited item's current shape count, selection, and undo/redo availability, so the panel can reflect them (enabling/disabling its buttons). */
  private notifyCollisionShapesChange(): void {
    if (!this.editingInstanceId) return;
    // Render order is derived from the footprint now (see footprintDepth), so
    // redrawing a shape has to refresh it or the piece keeps sorting by the
    // shape it had when the session opened.
    const edited = this.items.get(this.editingInstanceId);
    if (edited) this.applyDepth(edited);
    if (!this.onCollisionShapesChange) return;
    this.onCollisionShapesChange({
      itemId: this.editingInstanceId,
      kind: this.editingKind ?? "",
      shapeCount: (this.currentShapes() ?? []).length,
      hasSelection: this.selectedShapeIndex !== null,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    });
  }
}
