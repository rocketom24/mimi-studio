import * as Phaser from "phaser";
import { project, unproject } from "@/game/world/projection";
import { visualDepth } from "@/game/world/depth";
import { canonicalKind, resolveEditorTextureKey } from "@/game/world/furnitureEditorAssets";
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
  { id: "sofa-removebg-preview-1788435297019-407587", kind: "sofa-removebg-preview", x: 116.16972875104216, y: 167.21366566758542, rotation: 0, scale: 1 },
  { id: "tv-removebg-preview-1788435302309-827849", kind: "tv-removebg-preview", x: 67.00226076926154, y: 166.50160588021964, rotation: 0, scale: 1.4000000000000004 },
  { id: "pc-1788435327182-565160", kind: "pc", x: 326.01557802736977, y: 53.369505057010144, rotation: 0, scale: 1.1 },
  { id: "chair-1788435337352-491020", kind: "chair", x: 360.31602181570827, y: 35.17984357222838, rotation: 0, scale: 1 },
  { id: "plant-2-1788435346761-645199", kind: "plant-2", x: 228.25380368821445, y: 326.31924696364104, rotation: 0, scale: 1.1 },
  { id: "plant-2-1788435354439-163005", kind: "plant-2", x: 370.7812568587184, y: 226.72092563027843, rotation: 0, scale: 1 },
  { id: "centertable-removebg-preview-1788435415150-773159", kind: "centertable-removebg-preview", x: 68.47186057927101, y: 150.5948677043754, rotation: 0, scale: 1 },
  { id: "bookshelf-removebg-preview-1788439324357-786572", kind: "bookshelf-removebg-preview", x: 263.84823211640673, y: 60.47777521344918, rotation: 0, scale: 1.2000000000000002 },
  { id: "almirah-removebg-preview-1788439329424-82462", kind: "almirah-removebg-preview", x: 257.8257523343151, y: 218.32743324133435, rotation: 0, scale: 1 },
  { id: "dressing-table-removebg-preview-1788439337469-573029", kind: "dressing-table-removebg-preview", x: 258.4851651046857, y: 180.54928434014008, rotation: 0, scale: 1 },
  { id: "mirror-removebg-preview (1)-1788439343555-29770", kind: "mirror-removebg-preview (1)", x: 236.82220701869514, y: 161.10716315055296, rotation: 0, scale: 1 },
  { id: "kitchen-removebg-preview-1788439355165-835245", kind: "kitchen-removebg-preview", x: 145.99844927391527, y: 54.55247722383828, rotation: 0, scale: 1.2000000000000002 },
  { id: "fridge-removebg-preview-1788439379412-137200", kind: "fridge-removebg-preview", x: 119.32827899606988, y: 83.77647937408935, rotation: 0, scale: 1.1 },
  { id: "sink-removebg-preview-1788452301324-233947", kind: "sink-removebg-preview", x: 190.301439477266, y: 40.0742969400242, rotation: 0, scale: 0.9 },
  { id: "corner-sofa-removebg-preview-1788519967349-955190", kind: "corner-sofa-removebg-preview", x: 81.20144404842917, y: 78.40045855880147, rotation: 0, scale: 1.9000000000000008 },
  // Dining set (table + 2 chairs) shifted +26 world-px east as a group from
  // their original placement — that placement sat flush against the sofa's
  // back with zero gap, walling off the only north-south walkway through the
  // living room's middle (corner sofa to sofa-back/dining area) except a
  // hairline sliver by the east wall. +26 opens a real ~14px corridor
  // between the sofa and the table without touching the east wall/door.
  { id: "dining2-removebg-preview-1788520014798-709680", kind: "dining2-removebg-preview", x: 196.22571267987126, y: 153.64045391467715, rotation: 0, scale: 1.5000000000000004 },
  { id: "dchair1-removebg-preview-1788520027198-939327", kind: "dchair1-removebg-preview", x: 207.622813451182, y: 153.4841628150772, rotation: 0, scale: 1 },
  { id: "dchair2-removebg-preview-1788520054888-988971", kind: "dchair2-removebg-preview", x: 181.73968022638206, y: 147.73920407115997, rotation: 0, scale: 0.8 },
  { id: "bed2-removebg-preview-1788520080187-821975", kind: "bed2-removebg-preview", x: 344.11922403785195, y: 238.25562477106584, rotation: 0, scale: 2.6000000000000014 },
  { id: "grass-1-removebg-preview-1788520107890-620936", kind: "grass-1-removebg-preview", x: 269.45315256472645, y: 263.69447089655114, rotation: 0, scale: 1.4000000000000004 },
  { id: "clock-removebg-preview-1788520126643-915563", kind: "clock-removebg-preview", x: 263.3703092686799, y: 93.47168240958712, rotation: 0, scale: 1 },
  { id: "g2-removebg-preview-1788523358555-676430", kind: "g2-removebg-preview", x: 362.90576655372377, y: 310.53873070833754, rotation: 0, scale: 2.300000000000001 },
  { id: "plant-1-1788523450903-256618", kind: "plant-1", x: 134.48392646192693, y: 322.56028302761445, rotation: 0, scale: 1 },
];

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
  kitchen: 0.22,
  fridge: 0.3,
  sink: 0.28,
  bookshelf: 0.3,
  mirror: 0.12,
  "dressing-table": 0.3,
  almirah: 0.35,
};

function footprintDepthRatio(kind: string): number {
  return FOOTPRINT_DEPTH_RATIO_BY_KIND[canonicalKind(kind)] ?? FOOTPRINT_DEPTH_RATIO;
}

/**
 * Kitchen counter-run pieces (kitchen/fridge/sink) are fixed flush against
 * the room's north wall, not free-standing — but their footprint depth (see
 * FOOTPRINT_DEPTH_RATIO_BY_KIND) is only a shallow strip centered on the
 * sprite's front floor-contact point. That leaves the strip short of the
 * wall behind it, an uncollided gap Mimi can walk into and read as standing
 * inside/behind the counter. extendFootprintToBackWall stretches the rect's
 * north edge to the room's actual wall face so the footprint runs unbroken
 * from the wall to the counter's own front edge.
 */
const BACK_WALL_KITCHEN_KINDS = new Set(["kitchen", "fridge", "sink"]);

function extendFootprintToBackWall(
  rect: { x: number; y: number; w: number; h: number },
  kind: string,
): { x: number; y: number; w: number; h: number } {
  if (!BACK_WALL_KITCHEN_KINDS.has(canonicalKind(kind))) return rect;
  const bounds = roomBoundsAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
  if (!bounds) return rect;
  const wallFace = bounds.y0 - WALL_THICKNESS_PAD_PX;
  const southEdge = rect.y + rect.h;
  if (wallFace >= southEdge) return rect;
  return { ...rect, y: wallFace, h: southEdge - wallFace };
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
  fridge: { depthFrac: 0.27461, lengthFrac: 0.91537, offsetXFrac: -0.38373, offsetYFrac: -0.26957 },
  kitchen: { depthFrac: 0.84111, lengthFrac: 0.18504, offsetXFrac: -0.52321, offsetYFrac: -0.62586 },
  sink: { depthFrac: 0.23029, lengthFrac: 0.82246, offsetXFrac: -1.7814, offsetYFrac: -1.45524 },
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
  // corner-sofa.png and garden-sofa.png are each a whole seating-nook GROUP
  // (2-3 chairs + a table, sometimes a plant), not one object — no single
  // rectangle is their "exact physical base." Footprint covers the group's
  // outer extent so Mimi can't cut through the middle of the nook.
  "corner-sofa": { depthFrac: 0.61854, lengthFrac: 1.6653, offsetXFrac: -1.06094, offsetYFrac: -0.54788 },
  g2: { depthFrac: 0.75684, lengthFrac: 1.41193, offsetXFrac: -0.62864, offsetYFrac: -0.35983 },
  // Table + 2 chairs as one group, same reasoning as corner-sofa/g2 above.
  // dchair1/dchair2 are separate placed items in this same small nook
  // (their anchors sit within ~25 world px of dining2's, well inside this
  // footprint), so their own generic-model boxes stay harmlessly redundant
  // with this one rather than needed for coverage.
  //
  // Earlier pass picked a bad 3rd point completing this as a parallelogram,
  // which (like pc below) overshot past the table's own footprint into the
  // walkway beside it — confirmed by rendering it over the live scene.
  // Redone from the table's actual front-leg span + a table-depth ratio
  // (0.55) instead of a mismeasured 3rd corner.
  dining2: { depthFrac: 0.40353, lengthFrac: 0.73369, offsetXFrac: -0.65033, offsetYFrac: -0.45291 },
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
  return extendFootprintToBackWall(rect, item.kind);
}

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
 * collision.ts reads collisionRects() below once, right after load(), to
 * turn every spawned item's rendered footprint into solid physics geometry.
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
    this.ghost = this.scene.add.image(0, 0, resolveEditorTextureKey(kind)).setOrigin(0.5, originYFor(kind)).setAlpha(0.6).setDepth(4000);
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
      if (isFurnitureEditorItem(entry)) this.spawn(entry);
    }
  }

  /** Solid collision rects (world px) for every currently spawned item — call after load(). */
  collisionRects(): { x: number; y: number; w: number; h: number }[] {
    return Array.from(this.items.values()).map(computeFootprintRect);
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
    const image = this.scene.add.image(anchor.x, anchor.y, resolveEditorTextureKey(data.kind)).setOrigin(0.5, originYFor(data.kind));
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
