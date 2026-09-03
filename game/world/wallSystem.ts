import * as Phaser from "phaser";
import { TILE_SIZE, WALL_COLOR, WALL_HEIGHT_PX, WORLD_TILE_HEIGHT, WORLD_TILE_WIDTH } from "@/game/config/world";
import { ROOMS } from "@/game/world/rooms";
import { ARCH_PALETTE, darken, lighten } from "@/game/world/palette";
import { DEPTH, visualDepth } from "@/game/world/depth";
import { getCameraMode, project } from "@/game/world/projection";
import { mergeVerticalRuns } from "@/game/world/gridRects";
import type { DoorGap, PixelRect, RoomDef } from "@/game/types/world";

/**
 * Wall cross-section thickness, in world px — both camera modes draw (and
 * collide, see computeWallRects) at this same thin band instead of the full
 * TILE_SIZE tile depth, so isometric and top-down never show a different
 * wall width for the same physical wall, and walls read proportionate to
 * the widened doorways (see rooms.ts). Also the thickness windows recess
 * into (see createWindows).
 */
export const WALL_THICKNESS_PX = 6;

/**
 * Half the tile depth trimmed off each side when thinning a wall run down to
 * WALL_THICKNESS_PX — also how far in from the raw tile grid's edge the
 * house's own outer border sits (see clampToHouseBorder), which floorSystem
 * reuses so floor never renders past the walls' outer face.
 */
export const WALL_THICKNESS_PAD_PX = (TILE_SIZE - WALL_THICKNESS_PX) / 2;

const px = (tiles: number) => tiles * TILE_SIZE;

/** A single drawn wall segment, kept around so occlusionSystem can fade its front face live. */
export interface WallSegment {
  rect: PixelRect;
  graphics: Phaser.GameObjects.Graphics;
}

/**
 * Builds one wall tile exactly once per tile, however many rooms border it.
 * A boolean grid (not per-room rect drawing) is what makes this possible:
 * two adjacent rooms both "claiming" their shared divider tile, or a room's
 * corner tile being touched by both its north and west edge, just sets the
 * same cell twice — no duplicate overlapping rects, no uncovered corner
 * tiles (the old per-room-edge approach only walked straight runs and never
 * touched the diagonal corner tile, leaving a hole there).
 */
export function buildWallGrid(): boolean[][] {
  const grid: boolean[][] = Array.from({ length: WORLD_TILE_HEIGHT }, () => Array(WORLD_TILE_WIDTH).fill(false));
  const set = (tx: number, ty: number, value: boolean) => {
    if (tx >= 0 && tx < WORLD_TILE_WIDTH && ty >= 0 && ty < WORLD_TILE_HEIGHT) grid[ty][tx] = value;
  };

  for (let tx = 0; tx < WORLD_TILE_WIDTH; tx++) {
    set(tx, 0, true);
    set(tx, WORLD_TILE_HEIGHT - 1, true);
  }
  for (let ty = 0; ty < WORLD_TILE_HEIGHT; ty++) {
    set(0, ty, true);
    set(WORLD_TILE_WIDTH - 1, ty, true);
  }

  for (const room of ROOMS) {
    const { x, y, w, h } = room.tiles;
    for (let tx = x - 1; tx <= x + w; tx++) {
      set(tx, y - 1, true); // north, corners included
      set(tx, y + h, true); // south, corners included
    }
    for (let ty = y; ty < y + h; ty++) {
      set(x - 1, ty, true); // west
      set(x + w, ty, true); // east
    }
  }

  for (const room of ROOMS) {
    const { x, y, w, h } = room.tiles;
    for (const door of room.doors) {
      for (let i = 0; i < door.length; i++) {
        if (door.side === "north") set(x + door.offset + i, y - 1, false);
        else if (door.side === "south") set(x + door.offset + i, y + h, false);
        else if (door.side === "west") set(x - 1, y + door.offset + i, false);
        else set(x + w, y + door.offset + i, false);
      }
    }
  }

  return grid;
}

/** One door's world-space placement, as a hinge point plus the two unit directions its leaf swings between — see doorSystem.ts. */
export interface DoorPlacement {
  room: RoomDef;
  door: DoorGap;
  /** Fixed jamb corner the leaf pivots around. */
  hinge: { x: number; y: number };
  /** Unit vector the leaf spans when closed — along the wall line, plugging the gap. */
  closedDir: { x: number; y: number };
  /** Unit vector the leaf swings toward when open — perpendicular, into the room that declared it. */
  openDir: { x: number; y: number };
  /** Leaf length in world px (door.length tiles). */
  span: number;
  /** True iff this door sits in the house's own outer north row / west column (see buildWallRuns' isBackWall) — those walls stay solid 3D blocks in isometric, so the door plugging one should too, instead of blending like a front-wall door. */
  isBackWall: boolean;
}

/**
 * Placement for every declared door, in world-pixel space — read by
 * doorSystem.ts to draw and animate the visible leaf. Kept in lockstep with
 * buildWallGrid's own door-gap loop above (same room.doors data, same
 * per-side offset math) so the leaf can never drift from the actual wall
 * opening.
 *
 * `hinge` sits on the wall band's own centerline, not the room-facing tile
 * edge: the wall row/column a door cuts through draws as a WALL_THICKNESS_PX
 * band centered in its tile (see thinRect), and that center is always
 * exactly half a tile in from the room edge, regardless of THICKNESS_PX —
 * landing the door leaf's swing plane flush with the wall it's plugging
 * instead of floating TILE_SIZE/2 px out into the room.
 */
export function computeDoorPlacements(rooms: RoomDef[]): DoorPlacement[] {
  const placements: DoorPlacement[] = [];
  const half = TILE_SIZE / 2;
  for (const room of rooms) {
    const { x, y, w, h } = room.tiles;
    for (const door of room.doors) {
      const along = px(door.offset);
      const span = px(door.length);
      if (door.side === "north") {
        placements.push({ room, door, hinge: { x: px(x) + along, y: px(y) - half }, closedDir: { x: 1, y: 0 }, openDir: { x: 0, y: 1 }, span, isBackWall: y - 1 === 0 });
      } else if (door.side === "south") {
        placements.push({ room, door, hinge: { x: px(x) + along, y: px(y + h) + half }, closedDir: { x: 1, y: 0 }, openDir: { x: 0, y: -1 }, span, isBackWall: y + h === 0 });
      } else if (door.side === "west") {
        placements.push({ room, door, hinge: { x: px(x) - half, y: px(y) + along }, closedDir: { x: 0, y: 1 }, openDir: { x: 1, y: 0 }, span, isBackWall: x - 1 === 0 });
      } else {
        placements.push({ room, door, hinge: { x: px(x + w) + half, y: px(y) + along }, closedDir: { x: 0, y: 1 }, openDir: { x: -1, y: 0 }, span, isBackWall: x + w === 0 });
      }
    }
  }
  return placements;
}

/**
 * Merges a wall-tile grid into rects: one rect per contiguous horizontal run
 * per row, then a second pass stacks consecutive same-(x, w) rows into one
 * taller rect — so a straight vertical wall line (a west/east border, an
 * interior divider) collapses into a single rect instead of one block per
 * tile-row. `excludeRow`, if given, is skipped entirely (used to hide the
 * drawn front border while keeping it solid via the un-excluded grid).
 *
 * Every solid tile is assigned to exactly one rect (never two) — a
 * T-junction tile belongs to whichever run's row-scan absorbed it. Two
 * independent per-axis scans were tried instead (one rect per orientation
 * per tile), but at every joint that meant two separate 3D wall blocks
 * overlapping in isometric mode, and their edge outlines crossed into a
 * visible seam/spike instead of one clean corner. A single exclusive
 * partition draws exactly one block per joint; thinRect's end-pad (below) is
 * what closes the seam between adjacent exclusive rects instead.
 */
function gridToRects(grid: boolean[][]): PixelRect[] {
  const rowRuns: PixelRect[] = [];
  for (let ty = 0; ty < grid.length; ty++) {
    const row = grid[ty];
    let runStart = -1;
    for (let tx = 0; tx <= row.length; tx++) {
      const solid = tx < row.length && row[tx];
      if (solid && runStart === -1) runStart = tx;
      else if (!solid && runStart !== -1) {
        rowRuns.push({ x: px(runStart), y: px(ty), w: px(tx - runStart), h: TILE_SIZE });
        runStart = -1;
      }
    }
  }
  return mergeVerticalRuns(rowRuns.map((rect) => ({ key: "", rect }))).map((item) => item.rect);
}

/** Which axis a wall run is thin across — the other axis is its (possibly multi-tile) length. */
type WallOrientation = "horizontal" | "vertical";

function classifyRun(rect: PixelRect): WallOrientation {
  return rect.h <= rect.w ? "horizontal" : "vertical";
}

/**
 * Clips a rect to the house's own outer border — WALL_THICKNESS_PAD_PX in
 * from the raw tile-grid edge on every side, matching where a perimeter
 * wall's own thin band actually sits (see thinRect). A run whose raw tile
 * extent already reaches the grid edge (e.g. the north border spans every
 * column) has nothing to pad there, but its un-padded edge still lands
 * exactly on the grid edge — a full WALL_THICKNESS_PAD_PX past the
 * perpendicular wall's own inset band, so the two visibly failed to line up
 * at the corner. Clamping to the inset border instead of the raw grid edge
 * is what makes every exterior wall's outer face flush.
 */
export function clampToHouseBorder(rect: PixelRect): PixelRect {
  const pad = WALL_THICKNESS_PAD_PX;
  const maxX = px(WORLD_TILE_WIDTH) - pad;
  const maxY = px(WORLD_TILE_HEIGHT) - pad;
  const x0 = Math.max(pad, rect.x);
  const y0 = Math.max(pad, rect.y);
  const x1 = Math.min(maxX, rect.x + rect.w);
  const y1 = Math.min(maxY, rect.y + rect.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Shrinks one full-tile-thick run rect down to WALL_THICKNESS_PX, centered
 * on its thin axis, and extends its long axis by the trimmed-off pad on
 * whichever end(s) `padStart`/`padEnd` say actually meet another wall run.
 * That extension isn't cosmetic slack — when a run's end tile is where a
 * perpendicular run meets it (a corner or T-junction), the neighbor's own
 * thin band starts exactly one tile-pad short of the shared tile edge, and
 * padding this run out to meet it is what makes two thin bands actually
 * touch at the joint instead of leaving a gap (see gridToRects'
 * corner-tile-only-owned-by-one-run construction). An end with no such
 * neighbor — a door/archway gap, or open floor — gets no pad: nothing is
 * there to close a seam against, and padding anyway would just bite into
 * the open gap next to it. clampToHouseBorder then keeps whatever's left at
 * the house's own outer edge instead of the raw tile grid's.
 */
function thinRect(rect: PixelRect, orientation: WallOrientation, padStart: boolean, padEnd: boolean): PixelRect {
  const pad = WALL_THICKNESS_PAD_PX;
  if (orientation === "horizontal") {
    const x = rect.x - (padStart ? pad : 0);
    const w = rect.w + (padStart ? pad : 0) + (padEnd ? pad : 0);
    return clampToHouseBorder({ x, y: rect.y + pad, w, h: WALL_THICKNESS_PX });
  }
  const y = rect.y - (padStart ? pad : 0);
  const h = rect.h + (padStart ? pad : 0) + (padEnd ? pad : 0);
  return clampToHouseBorder({ x: rect.x + pad, y, w: WALL_THICKNESS_PX, h });
}

/** One thinned wall run. */
interface WallRun {
  thin: PixelRect;
  orientation: WallOrientation;
  /**
   * True for the house's own outer north row / west column — the two
   * "back" walls of the dollhouse cutaway, which stay solid in isometric
   * mode no matter what. Every other run (south/east exterior border,
   * every interior divider) is a "front" wall — see createWalls.
   */
  isBackWall: boolean;
}

function makeWallRun(grid: boolean[][], rect: PixelRect, forceBackWall?: boolean): WallRun {
  const orientation = classifyRun(rect);
  const tx = rect.x / TILE_SIZE;
  const ty = rect.y / TILE_SIZE;
  const tileLen = orientation === "horizontal" ? rect.w / TILE_SIZE : rect.h / TILE_SIZE;
  // Only pad an end toward a tile that's actually another DRAWN wall run —
  // a door/archway gap or the world edge has nothing there to meet (see
  // thinRect), and neither does an openExteriorEdges() segment: it's still
  // solid in the collision grid, but nothing gets drawn there, so padding
  // toward it would leave a dangling stub with nothing to butt against.
  const padStart = orientation === "horizontal" ? isSolidTile(grid, tx - 1, ty) : isSolidTile(grid, tx, ty - 1);
  const padEnd =
    orientation === "horizontal" ? isSolidTile(grid, tx + tileLen, ty) : isSolidTile(grid, tx, ty + tileLen);
  const isBackWall = forceBackWall ?? (orientation === "horizontal" ? ty === 0 : tx === 0);
  return { thin: thinRect(rect, orientation, padStart, padEnd), orientation, isBackWall };
}

/**
 * `visualGrid` (defaults to `grid`) is what actually gets turned into drawn
 * rects, and is also `grid`'s padding reference (see makeWallRun) — a
 * segment hidden from `visualGrid` (see openExteriorEdges) draws nothing,
 * so its still-solid-for-collision neighbors in `grid` correctly stop
 * padding toward it too.
 */
function buildWallRuns(grid: boolean[][], visualGrid: boolean[][] = grid): WallRun[] {
  const runs: WallRun[] = [];
  for (const rect of gridToRects(visualGrid)) {
    // A row-scan run that starts at the west border but isn't the north
    // border itself (ty !== 0) is an interior/south divider that happens to
    // touch the back wall's own column — e.g. the Living Room/Cat Room
    // shared wall reaching x=0. gridToRects' exclusive partition (see its
    // doc comment) hands that corner tile to this horizontal run instead of
    // the west column's vertical run, so left un-split it inherits the
    // divider's front-wall (translucent shadow) styling and leaves a gap
    // against the solid back-wall column above/below it. Carving the corner
    // tile off as its own forced-back-wall run reunites it with that column.
    if (classifyRun(rect) === "horizontal" && rect.x === 0 && rect.y !== 0 && rect.w > TILE_SIZE) {
      runs.push(makeWallRun(visualGrid, { x: 0, y: rect.y, w: TILE_SIZE, h: rect.h }, true));
      runs.push(makeWallRun(visualGrid, { x: TILE_SIZE, y: rect.y, w: rect.w - TILE_SIZE, h: rect.h }));
      continue;
    }
    // A run's own west-start tile can likewise be the corner an INTERIOR
    // perpendicular wall passes through, not just the world's own west
    // border above — e.g. the Bedroom+Study/Garden divider (row 14)
    // starting exactly at the long col-14 corridor wall it meets. Same
    // cause as the x===0 case: gridToRects' row-scan claims that corner
    // tile for this horizontal run instead of the vertical wall running
    // through it. Left un-split, that corner tile draws as a horizontal
    // nub at the raw tile edge — sticking out from the joint instead of
    // sitting in it.
    //
    // Unlike the x===0 case, though, this tile can't just become its own
    // thinned run (vertical or otherwise): the vertical wall on both sides
    // of it (e.g. rows1-13 above, Garden's own west wall below) already
    // pads into this exact tile to meet each other there, so a second,
    // independently-padded run over the same tile would only double that
    // padding into a visible overlap — and even sized to fit exactly, a
    // second run still strokes its own separate outline, showing as a
    // little boxed-off square sitting in the middle of what should read as
    // one continuous line. What's actually needed is for this rect's own
    // thin band to simply start `pad` in from the raw tile edge — flush
    // against the vertical wall's own centerline — instead of at the edge
    // itself, folding the corner into this same run rather than drawing it
    // separately.
    if (classifyRun(rect) === "horizontal" && rect.x !== 0 && rect.w > TILE_SIZE) {
      const tx = rect.x / TILE_SIZE;
      const ty = rect.y / TILE_SIZE;
      const tileLen = rect.w / TILE_SIZE;
      const pad = WALL_THICKNESS_PAD_PX;
      // Either end of this run can be the corner an interior perpendicular
      // wall passes through (see the doc comment above) — checked
      // independently per end, since a run can meet a real vertical
      // neighbor on either side, or both (e.g. a short divider segment
      // pinched between two doors on one row but a full-width column below
      // each end).
      const continuesWest = isSolidTile(visualGrid, tx - 1, ty);
      const westIsCorner =
        !continuesWest && (isSolidTile(visualGrid, tx, ty - 1) || isSolidTile(visualGrid, tx, ty + 1));
      const lastTx = tx + tileLen - 1;
      const continuesEast = isSolidTile(visualGrid, tx + tileLen, ty);
      const eastIsCorner =
        !continuesEast && (isSolidTile(visualGrid, lastTx, ty - 1) || isSolidTile(visualGrid, lastTx, ty + 1));
      if (westIsCorner || eastIsCorner) {
        const x = rect.x + (westIsCorner ? pad : 0);
        const w = rect.w - (westIsCorner ? pad : 0) - (eastIsCorner ? pad : 0) + (continuesEast ? pad : 0);
        runs.push({
          thin: clampToHouseBorder({ x, y: rect.y + pad, w, h: WALL_THICKNESS_PX }),
          orientation: "horizontal",
          isBackWall: ty === 0,
        });
        continue;
      }
    }
    runs.push(makeWallRun(visualGrid, rect));
  }
  return runs;
}

/**
 * Every wall rectangle in the house, in world-pixel space, thinned to
 * WALL_THICKNESS_PX — this is the collision-authoritative set (includes the
 * south exterior border, which is never drawn — see computeVisibleWallRects).
 * Both the visual drawing and the collision bodies are built from the same
 * grid (and the same thinning), so they can never drift apart.
 */
export function computeWallRects(): PixelRect[] {
  return buildWallRuns(buildWallGrid()).map((run) => run.thin);
}

/** One border wall segment intentionally left undrawn — see openExteriorEdges. */
export interface OpenExteriorEdge {
  axis: "row" | "col";
  /** The border tile row (axis "row") or column (axis "col") itself. */
  index: number;
  /** Tile range [start, end) along the other axis that stays open. */
  start: number;
  end: number;
}

/**
 * A grass (outdoor) room's own south/east edge, wherever it lands exactly on
 * the world's south/east border — e.g. Garden: that edge is already the
 * playable world's own edge, so framing it with a wall/shadow reads as a
 * fence around empty air instead of a house wall. Only that room's own span
 * is affected; the rest of the same border row/column (other rooms that
 * happen to share it, e.g. Entrance's south wall) still draws normally.
 * Collision is unaffected — computeWallRects() never consults this.
 * floorSystem.ts reads this same list so a grass room's floor reaches the
 * true edge there too instead of stopping at the wall's usual pad inset.
 *
 * The range is widened by 1 tile past each end of the room's own span, not
 * clipped tight to it: the tile immediately beyond either end (e.g. Garden's
 * west wall column continuing down to meet the south border, one tile short
 * of Garden's own west edge) is purely the world border's own blanket edge
 * marking, not because any room needs a wall drawn there — left solid in
 * visualGrid, it gives the room's own (still-drawn) west/north wall
 * something to pad an orphaned end-cap against, a stray tab with nothing on
 * the other side to butt up to.
 *
 * That widened tile is skipped, though, wherever it's ALSO a real wall
 * corner some other (non-grass) room owns — e.g. Garden's south edge widens
 * west into (x-1, y+h), but that's exactly Entrance's own south-east corner
 * one column over. Opening it erases a real load-bearing wall Entrance still
 * needs, leaving its own corner (and whatever interior wall runs through it,
 * e.g. the Entrance/Garden divider) dangling short instead of reaching the
 * border it was supposed to gain a pad target from.
 */
function isOtherRoomWallCorner(tx: number, ty: number, exclude: RoomDef): boolean {
  return ROOMS.some((room) => {
    if (room === exclude) return false;
    const { x, y, w, h } = room.tiles;
    const onNorthOrSouth = (ty === y - 1 || ty === y + h) && tx >= x - 1 && tx <= x + w;
    const onWestOrEast = (tx === x - 1 || tx === x + w) && ty >= y - 1 && ty <= y + h;
    return onNorthOrSouth || onWestOrEast;
  });
}

export function openExteriorEdges(): OpenExteriorEdge[] {
  const edges: OpenExteriorEdge[] = [];
  for (const room of ROOMS) {
    if (room.floorType !== "grass") continue;
    const { x, y, w, h } = room.tiles;
    if (y + h === WORLD_TILE_HEIGHT - 1) {
      const start = isOtherRoomWallCorner(x - 1, y + h, room) ? x : x - 1;
      const end = isOtherRoomWallCorner(x + w, y + h, room) ? x + w : x + w + 1;
      edges.push({ axis: "row", index: y + h, start: Math.max(0, start), end: Math.min(WORLD_TILE_WIDTH, end) });
    }
    if (x + w === WORLD_TILE_WIDTH - 1) {
      const start = isOtherRoomWallCorner(x + w, y - 1, room) ? y : y - 1;
      const end = isOtherRoomWallCorner(x + w, y + h, room) ? y + h : y + h + 1;
      edges.push({ axis: "col", index: x + w, start: Math.max(0, start), end: Math.min(WORLD_TILE_HEIGHT, end) });
    }
  }
  return edges;
}

/**
 * The DRAWN subset of computeWallRects(): every openExteriorEdges() segment
 * is omitted so an outdoor room's own border edge reads as open ground,
 * while still colliding (see computeWallRects). Everything else — interior
 * walls, the rest of the exterior border — draws normally.
 */
export function computeVisibleWallRects(): PixelRect[] {
  const grid = buildWallGrid();
  const visualGrid = grid.map((row) => row.slice());
  for (const edge of openExteriorEdges()) {
    for (let i = edge.start; i < edge.end; i++) {
      if (edge.axis === "row") visualGrid[edge.index][i] = false;
      else visualGrid[i][edge.index] = false;
    }
  }
  return buildWallRuns(grid, visualGrid).map((run) => run.thin);
}

/** A box's flat (z=0) footprint corners, in world-pixel space, walked in perimeter order (each entry adjacent to its neighbors) — see drawBox. */
export type BoxFootprint = readonly [WorldPoint, WorldPoint, WorldPoint, WorldPoint];
interface WorldPoint {
  x: number;
  y: number;
}

/**
 * Draws one world-space quad footprint as a short 3D block, at WALL_HEIGHT_PX
 * tall: a footprint plate at floor level, its two camera-facing side faces
 * extruded up, and a top cap. All corners are individually projected so the
 * block reads as a slanted box under the fixed oblique camera.
 *
 * The footprint doesn't have to be an axis-aligned rect — doorSystem.ts
 * reuses this for its (possibly rotated) door-leaf slab. Which two of the
 * quad's four edges are "camera-facing" isn't fixed to two hardcoded
 * corners: under this projection, larger (worldX + worldY) always projects
 * nearer the viewer (see projection.ts), so whichever corner maximizes that
 * sum is the box's nearest corner, and its two adjacent edges are the two
 * faces actually visible from the fixed camera. For an axis-aligned wall
 * rect that's always the south+east corner/edges (matching the old
 * hardcoded behavior); for a door leaf, which corner is nearest keeps
 * changing as it swings, so a fixed edge choice was drawing the FAR face on
 * roughly half of all doors/angles, leaving the near face — the one
 * actually facing the camera — blank.
 *
 * Both adjacent faces are drawn, not just whichever edge is longer: a real
 * box has two visible sides here, and skipping one left the short end of
 * every wall run looking like a folded flat card instead of a solid block.
 * The two faces share the near corner's top/base edge, so together they
 * read as one continuous corner.
 *
 * In top-down mode project() ignores z entirely, so every top point here
 * collapses onto its z=0 counterpart and both face quads degenerate to zero
 * area for free — only the flat footprint plate and its outline end up
 * visible, giving top-down its floor-plan look with no extra branching here.
 * (The faces' mid-height highlight band is computed via a real project(...,
 * WALL_HEIGHT_PX / 2) call rather than a screen-space offset for exactly
 * this reason — a fixed-pixel screen offset doesn't know to collapse to
 * zero in top-down, and used to leave a stray WALL_HEIGHT_PX/2-tall smear
 * hanging off every door there.)
 */
export function drawBox(g: Phaser.GameObjects.Graphics, corners: BoxFootprint, baseColor: number): void {
  const faceTop = lighten(baseColor, 10);
  const faceBottom = darken(baseColor, 12);
  const highlight = ARCH_PALETTE.wallHighlight;
  const capShade = darken(baseColor, 4);

  const base = corners.map((p) => project(p.x, p.y));
  const top = corners.map((p) => project(p.x, p.y, WALL_HEIGHT_PX));

  // Footprint plate — keeps the floor from ever showing through at the base.
  g.fillStyle(baseColor, 1);
  g.fillPoints(base, true);

  let nearIdx = 0;
  for (let i = 1; i < 4; i++) {
    if (corners[i].x + corners[i].y > corners[nearIdx].x + corners[nearIdx].y) nearIdx = i;
  }
  const prevIdx = (nearIdx + 3) % 4;
  const nextIdx = (nearIdx + 1) % 4;

  // One face, given its two corner indices (the shared "near" one, and its neighbor).
  const drawFace = (aIdx: number, bIdx: number) => {
    const baseA = base[aIdx];
    const baseB = base[bIdx];
    const topA = top[aIdx];
    const topB = top[bIdx];
    g.fillStyle(faceBottom, 1);
    g.fillPoints([baseA, baseB, topB, topA], true);
    const midA = project(corners[aIdx].x, corners[aIdx].y, WALL_HEIGHT_PX / 2);
    const midB = project(corners[bIdx].x, corners[bIdx].y, WALL_HEIGHT_PX / 2);
    g.fillStyle(faceTop, 0.9);
    g.fillPoints([topA, topB, midB, midA], true);
    g.lineStyle(1, ARCH_PALETTE.outline, 0.6);
    g.lineBetween(topA.x, topA.y, baseA.x, baseA.y);
    g.lineBetween(topB.x, topB.y, baseB.x, baseB.y);
  };

  // The near corner's two edges — they share its top/base point.
  drawFace(prevIdx, nearIdx);
  drawFace(nextIdx, nearIdx);

  // Top cap.
  g.fillStyle(capShade, 1);
  g.fillPoints(top, true);
  g.lineStyle(1, highlight, 0.9);
  g.lineBetween(top[0].x, top[0].y, top[1].x, top[1].y);

  // Dark charcoal outline around the whole block, per the reference palette.
  g.lineStyle(1, ARCH_PALETTE.outline, 0.6);
  g.strokePoints(top, true);
}

/** Wall-specific wrapper: a rect's own corners as a BoxFootprint, drawn in WALL_COLOR (see drawBox). */
function drawWallBlock(g: Phaser.GameObjects.Graphics, rect: PixelRect): void {
  drawBox(
    g,
    [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ],
    WALL_COLOR,
  );
}

function isSolidTile(grid: boolean[][], tx: number, ty: number): boolean {
  return ty >= 0 && ty < grid.length && tx >= 0 && tx < grid[ty].length && grid[ty][tx];
}

/**
 * Top-down wall rendering: flat fill of the thinned run rect (see
 * buildWallRuns), no bevel/shadow — a true floor-plan look, straight down
 * with no directional lighting cues.
 */
function drawWallRunTopDown(g: Phaser.GameObjects.Graphics, run: WallRun): void {
  const rect = run.thin;
  const nw = project(rect.x, rect.y);
  const ne = project(rect.x + rect.w, rect.y);
  const se = project(rect.x + rect.w, rect.y + rect.h);
  const sw = project(rect.x, rect.y + rect.h);

  g.fillStyle(WALL_COLOR, 1);
  g.fillPoints([nw, ne, se, sw], true);
}

/**
 * Flat shadow cast for an invisible "front" wall in isometric — same
 * footprint rect as the real wall (see createWalls's isBackWall split),
 * flush with the floor instead of the full 3D block. Mimi still collides
 * with the real (invisible) wall at exactly this footprint — computeWallRects
 * doesn't know about isBackWall at all — so drawing its outline is what lets
 * her see the boundary coming instead of walking into it blind, repeatedly.
 */
function drawWallShadow(g: Phaser.GameObjects.Graphics, rect: PixelRect): void {
  const nw = project(rect.x, rect.y);
  const ne = project(rect.x + rect.w, rect.y);
  const se = project(rect.x + rect.w, rect.y + rect.h);
  const sw = project(rect.x, rect.y + rect.h);

  g.fillStyle(darken(WALL_COLOR, 35), FRONT_WALL_SHADOW_ALPHA);
  g.fillPoints([nw, ne, se, sw], true);
  g.lineStyle(1, ARCH_PALETTE.outline, 0.4);
  g.strokePoints([nw, ne, se, sw], true);
}

/** Opacity of a "front" wall's flat shadow (see drawWallShadow) — also what a front-wall door leaf fades to at closed, so it blends into the same invisible band instead of sitting on it as an opaque block (see doorSystem's drawDoorLeaf). */
export const FRONT_WALL_SHADOW_ALPHA = 0.45;

/**
 * Renders every wall run. Top-down draws every run as a flat band
 * (drawWallRunTopDown) — a true floor-plan look, nothing needs hiding to
 * stay readable there. Isometric only draws the house's back walls (north
 * row, west column — see buildWallRuns' isBackWall) as full solid 3D blocks
 * (drawWallBlock); every other wall (south/east exterior border, every
 * interior divider) draws as a flat translucent shadow (drawWallShadow)
 * instead — invisible enough to keep the elevated dollhouse view open, but
 * still marking exactly where its (very real) collision footprint is. Doors
 * read as openings either way — doorSystem draws their leaf independently
 * of wall styling.
 */
export function createWalls(scene: Phaser.Scene): WallSegment[] {
  const isTopdown = getCameraMode() === "topdown";
  const grid = buildWallGrid();
  const visualGrid = grid.map((row) => row.slice());
  for (const edge of openExteriorEdges()) {
    for (let i = edge.start; i < edge.end; i++) {
      if (edge.axis === "row") visualGrid[edge.index][i] = false;
      else visualGrid[i][edge.index] = false;
    }
  }
  const runs = buildWallRuns(grid, visualGrid);
  const segments: WallSegment[] = [];
  for (const run of runs) {
    const rect = run.thin;
    // Back-wall runs (north row / west column) can span the full house
    // height/width in one merged rect (see gridToRects' vertical-run
    // merge), so visualDepth(rect.y + rect.h) would pin the whole solid
    // block to its southmost row's depth — putting it in front of Mimi at
    // every other row along the run. She can never stand behind the
    // house's own outer wall, so it always belongs at the back instead of
    // Y-sorting against her.
    const depth = run.isBackWall ? DEPTH.DYNAMIC_BASE : visualDepth(rect.y + rect.h);
    const g = scene.add.graphics().setDepth(depth);
    if (isTopdown) drawWallRunTopDown(g, run);
    else if (run.isBackWall) drawWallBlock(g, rect);
    else drawWallShadow(g, rect);
    segments.push({ rect, graphics: g });
  }
  return segments;
}

/**
 * A window's authored rect gives its span (x, w) and which tile row it sits
 * on (y); the actual drawn band is recentered onto the same thin cosmetic
 * thickness the wall itself now draws at, so the window reads as set into
 * the wall rather than floating at the old full-tile height.
 */
const WINDOW_SILL_PX = 2;

/** Decorative window: frame, glass, center mullion, sill ledge, subtle highlight — sized to the thin wall band. Never collides. Skipped when its wall row is cut away (front/open-side walls), so no window floats in front of nothing. Returns null when the room has none or none are visible. */
export function createWindows(scene: Phaser.Scene, room: RoomDef): Phaser.GameObjects.Graphics | null {
  if (!room.windows?.length) return null;
  const isTopdown = getCameraMode() === "topdown";
  const g = scene.add.graphics().setDepth(DEPTH.LABEL_BASE);
  let drewAny = false;

  for (const win of room.windows) {
    const wallRow = Math.round(win.y / TILE_SIZE);
    if (wallRow === WORLD_TILE_HEIGHT - 1) continue; // south border row is never drawn — its window shouldn't be either
    drewAny = true;
    if (isTopdown) drawWindowTopDown(g, win);
    else drawWindowIsometric(g, win);
  }

  if (!drewAny) {
    g.destroy();
    return null;
  }
  return g;
}

/** Flat floor-plan window: a glazed gap in the wall band, seen straight down. */
function drawWindowTopDown(g: Phaser.GameObjects.Graphics, win: PixelRect): void {
  const bandY = win.y + WALL_THICKNESS_PAD_PX;
  const anchor = project(win.x, bandY);
  const h = WALL_THICKNESS_PX;

  g.fillStyle(ARCH_PALETTE.windowFrame, 1);
  g.fillRect(anchor.x, anchor.y, win.w, h);

  const glassX = anchor.x + 1;
  const glassY = anchor.y + 1;
  const glassW = win.w - 2;
  const glassH = Math.max(1, h - 2);
  g.fillStyle(ARCH_PALETTE.windowGlass, 0.75);
  g.fillRect(glassX, glassY, glassW, glassH);

  g.fillStyle(lighten(ARCH_PALETTE.windowGlass, 40), 0.6);
  g.fillRect(glassX, glassY, glassW, 1);

  g.fillStyle(ARCH_PALETTE.windowFrame, 1);
  g.fillRect(anchor.x + Math.floor(win.w / 2), anchor.y, 1, h);

  // Sill: a short ledge below the frame reads as the window sitting in wall depth.
  g.fillStyle(darken(ARCH_PALETTE.windowFrame, 15), 1);
  g.fillRect(anchor.x - 1, anchor.y + h, win.w + 2, WINDOW_SILL_PX);
}

// How high off the floor the glazed opening starts/ends, within WALL_HEIGHT_PX —
// leaves a header above and an apron below so it reads as a punched-out opening,
// not a band spanning the full wall height.
const WINDOW_Z_BOTTOM = WALL_HEIGHT_PX * 0.35;
const WINDOW_Z_TOP = WALL_HEIGHT_PX * 0.85;
const WINDOW_SILL_DEPTH_PX = 2; // world-space y the sill juts toward the camera, below the frame

/**
 * Isometric window: every corner is individually projected (like a wall's
 * drawFace — see drawBox), so the glass/frame/mullion/sill sit flush on the
 * wall's actual near face and shear with it under the fixed oblique camera,
 * instead of a screen-space rect that ignored the projection entirely.
 */
function drawWindowIsometric(g: Phaser.GameObjects.Graphics, win: PixelRect): void {
  // The wall's room-facing surface — same y drawBox picks as the near face
  // for a horizontal wall run (see drawWallBlock's nearIdx selection).
  const yFace = win.y + WALL_THICKNESS_PAD_PX + WALL_THICKNESS_PX;
  const x0 = win.x;
  const x1 = win.x + win.w;

  const quad = (xa: number, xb: number, za: number, zb: number, y = yFace) => [
    project(xa, y, za),
    project(xb, y, za),
    project(xb, y, zb),
    project(xa, y, zb),
  ];

  const frame = quad(x0 - 1, x1 + 1, WINDOW_Z_BOTTOM - 1, WINDOW_Z_TOP + 1);
  g.fillStyle(ARCH_PALETTE.windowFrame, 1);
  g.fillPoints(frame, true);
  g.lineStyle(1, ARCH_PALETTE.outline, 0.6);
  g.strokePoints(frame, true);

  g.fillStyle(ARCH_PALETTE.windowGlass, 0.75);
  g.fillPoints(quad(x0, x1, WINDOW_Z_BOTTOM, WINDOW_Z_TOP), true);

  // Glass highlight sliver along the top edge.
  g.fillStyle(lighten(ARCH_PALETTE.windowGlass, 40), 0.6);
  g.fillPoints(quad(x0, x1, WINDOW_Z_TOP - 1, WINDOW_Z_TOP), true);

  // Center mullion.
  const xm = x0 + win.w / 2;
  const mullBottom = project(xm, yFace, WINDOW_Z_BOTTOM);
  const mullTop = project(xm, yFace, WINDOW_Z_TOP);
  g.lineStyle(1, ARCH_PALETTE.windowFrame, 1);
  g.lineBetween(mullBottom.x, mullBottom.y, mullTop.x, mullTop.y);

  // Sill: a short ledge below the frame, projecting slightly toward the
  // camera so it reads as sticking out of the wall rather than painted flat.
  g.fillStyle(darken(ARCH_PALETTE.windowFrame, 15), 1);
  g.fillPoints(
    quad(x0 - 1, x1 + 1, WINDOW_Z_BOTTOM - 1 - WINDOW_SILL_PX, WINDOW_Z_BOTTOM - 1, yFace + WINDOW_SILL_DEPTH_PX),
    true,
  );
}
