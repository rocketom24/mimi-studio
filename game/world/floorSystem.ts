import * as Phaser from "phaser";
import { TILE_SIZE, WORLD_TILE_HEIGHT, WORLD_TILE_WIDTH } from "@/game/config/world";
import { darken, lighten } from "@/game/world/palette";
import { DEPTH } from "@/game/world/depth";
import { project } from "@/game/world/projection";
import { ROOMS } from "@/game/world/rooms";
import { mergeVerticalRuns } from "@/game/world/gridRects";
import { buildWallGrid, clampToHouseBorder, openExteriorEdges } from "@/game/world/wallSystem";
import type { PixelRect, RoomDef } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;

/** Projected quad (parallelogram) for a floor-plane rect — corners only, z=0. */
function floorQuad(x: number, y: number, w: number, h: number): Phaser.Types.Math.Vector2Like[] {
  return [project(x, y), project(x + w, y), project(x + w, y + h), project(x, y + h)];
}

/** Deterministic pseudo-random in [0,1) from a position + seed — same trick as wallSystem's old brick jitter, so the garden's "random" detail is stable across re-renders/resizes instead of reshuffling every draw. */
function grassHash(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** Small color palette for the garden's flowers — cycled one color per flower. */
const FLOWER_COLORS = [0xffffff, 0xffe066, 0xf78fb3];

/**
 * One grass blade as a filled (not stroked) triangle with a darker gusset
 * near its base — a flat stroke reads as a scratch on the floor; a lit tip
 * over a shadowed base reads as a blade standing up off the ground.
 */
function drawBlade(g: Phaser.GameObjects.Graphics, baseX: number, baseY: number, angle: number, len: number, colorBase: number): void {
  const width = 1.6;
  const dirX = Math.sin(angle);
  const dirY = -Math.cos(angle);
  const perpX = -dirY * (width / 2);
  const perpY = dirX * (width / 2);
  const tip = { x: baseX + dirX * len, y: baseY + dirY * len };
  const bl = { x: baseX - perpX, y: baseY - perpY };
  const br = { x: baseX + perpX, y: baseY + perpY };
  const gusset = { x: baseX + dirX * len * 0.35, y: baseY + dirY * len * 0.35 };
  g.fillStyle(lighten(colorBase, 14), 0.85);
  g.fillPoints([bl, br, tip], true);
  g.fillStyle(darken(colorBase, 16), 0.55);
  g.fillPoints([bl, br, gusset], true);
}

/**
 * A pebble as a 3-layer ellipse stack (contact shadow, shaded body, corner
 * highlight) instead of one flat dot — the same light-top/dark-base bevel
 * logic drawBox uses for furniture-scale props, just small enough to read as
 * a stone.
 */
function drawPebble(g: Phaser.GameObjects.Graphics, p: { x: number; y: number }, size: number, baseShade: number): void {
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(p.x + 0.6, p.y + 0.9, size * 1.15, size * 0.6);
  g.fillStyle(darken(baseShade, 10), 0.9);
  g.fillEllipse(p.x, p.y, size, size * 0.68);
  g.fillStyle(lighten(baseShade, 32), 0.8);
  g.fillEllipse(p.x - size * 0.2, p.y - size * 0.18, size * 0.42, size * 0.26);
}

/**
 * A single flower head: ground shadow, 4 shaded-and-highlighted petals
 * around a bright center — reads as one rounded bloom instead of a scatter
 * of flat same-color dots.
 */
function drawFlower(g: Phaser.GameObjects.Graphics, p: { x: number; y: number }, color: number): void {
  g.fillStyle(0x000000, 0.15);
  g.fillEllipse(p.x + 0.5, p.y + 0.8, 4.4, 2.2);
  for (let k = 0; k < 4; k++) {
    const a = (Math.PI / 2) * k + Math.PI / 4;
    const px = p.x + Math.cos(a) * 1.0;
    const py = p.y + Math.sin(a) * 0.6;
    g.fillStyle(darken(color, 10), 0.9);
    g.fillEllipse(px, py, 2.3, 2.3);
    g.fillStyle(lighten(color, 20), 0.85);
    g.fillEllipse(px - 0.3, py - 0.3, 1.2, 1.2);
  }
  g.fillStyle(0xffd93d, 1);
  g.fillEllipse(p.x, p.y, 1.6, 1.6);
}

/**
 * Outdoor garden floor: dense grass tufts (3 shaded blades each, jittered
 * off a grid so it doesn't read as a repeating pattern), a scatter of
 * domed pebbles, and a few fixed flower heads — every prop layered with
 * highlight/shadow shapes instead of one flat fill, so the garden reads as
 * dimensional rather than a field of flat vector points. Its outer
 * (world-edge) sides get a dedicated fence-colored border — see
 * drawGardenEdgeBorder — instead of a stroke here, so the edge shared with
 * the house isn't double-lined.
 */
function drawGrassPattern(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, base: number): void {
  const TUFT_SPACING = 7;
  for (let ty = y + 3; ty < y + h; ty += TUFT_SPACING) {
    for (let tx = x + 3; tx < x + w; tx += TUFT_SPACING) {
      const jx = (grassHash(tx, ty, 1) - 0.5) * 4;
      const jy = (grassHash(tx, ty, 2) - 0.5) * 4;
      const anchor = project(tx + jx, ty + jy);
      for (let b = 0; b < 3; b++) {
        const angle = (grassHash(tx, ty, 3 + b) - 0.5) * 1.1 + (b - 1) * 0.35;
        const len = 2.2 + grassHash(tx, ty, 6 + b) * 2.8;
        const toneRoll = grassHash(tx, ty, 9 + b);
        const color = toneRoll < 0.33 ? lighten(base, 18) : toneRoll < 0.66 ? lighten(base, 6) : darken(base, 10);
        drawBlade(g, anchor.x, anchor.y, angle, len, color);
      }
    }
  }

  const PEBBLE_SPACING = 20;
  for (let ty = y + 6; ty < y + h; ty += PEBBLE_SPACING) {
    for (let tx = x + 6; tx < x + w; tx += PEBBLE_SPACING) {
      if (grassHash(tx, ty, 10) > 0.55) continue;
      const jx = (grassHash(tx, ty, 11) - 0.5) * 10;
      const jy = (grassHash(tx, ty, 12) - 0.5) * 10;
      const p = project(tx + jx, ty + jy);
      const shade = grassHash(tx, ty, 13) < 0.5 ? 0x9c9488 : 0x77705f;
      const size = 2 + grassHash(tx, ty, 14) * 1.4;
      drawPebble(g, p, size, shade);
    }
  }

  const clusters: Array<[number, number]> = [
    [0.2, 0.3],
    [0.62, 0.55],
    [0.4, 0.78],
  ];
  clusters.forEach(([fx, fy], i) => {
    const p = project(x + fx * w, y + fy * h);
    drawFlower(g, p, FLOWER_COLORS[i % FLOWER_COLORS.length]);
  });
}

/**
 * A grass room's own south/east edges double as the house's south border row
 * (never drawn — see wallSystem's "open-front dollhouse" comment) or a plain
 * translucent front-wall shadow — both read as the garden floor just running
 * out into nothing. Whichever of its 4 sides actually sit on the world's
 * outer edge get an explicit fence-colored line instead, so the garden
 * reads as bounded outdoor space rather than a house wall.
 */
function drawGardenEdgeBorder(g: Phaser.GameObjects.Graphics, room: RoomDef): void {
  const { x: tx, y: ty, w: tw, h: th } = room.tiles;
  const x = px(tx);
  const y = px(ty);
  const w = px(tw);
  const h = px(th);
  const color = darken(room.floorColor, 40);

  g.lineStyle(4, color, 1);
  if (ty + th === WORLD_TILE_HEIGHT - 1) {
    const a = project(x, y + h);
    const b = project(x + w, y + h);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  if (tx + tw === WORLD_TILE_WIDTH - 1) {
    const a = project(x + w, y);
    const b = project(x + w, y + h);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  if (ty === 0) {
    const a = project(x, y);
    const b = project(x + w, y);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  if (tx === 0) {
    const a = project(x, y);
    const b = project(x, y + h);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/**
 * Assigns every in-grid tile — including wall and door tiles — to a room
 * index, so the floor can be drawn as one continuous surface instead of one
 * quad per declared room rect. Walls are drawn as a thin band centered in
 * their tile (see WALL_THICKNESS_PX in wallSystem.ts), not the full tile, so
 * excluding wall tiles from the floor left the un-covered pad on either side
 * of every wall/door showing bare background instead of floor; walls always
 * draw above the floor layer (DEPTH.FLOOR < DYNAMIC_BASE), so floor under a
 * wall's own footprint is simply hidden, not wasted. Tiles inside a room's
 * own declared rect get that room directly; every other tile — walls,
 * doorway gaps, corridors — has no room of its own, so it's assigned via
 * flood fill from its nearest owned neighbor.
 */
function assignFloorOwners(): number[][] {
  const isWalkable = (tx: number, ty: number) =>
    tx >= 0 && tx < WORLD_TILE_WIDTH && ty >= 0 && ty < WORLD_TILE_HEIGHT;

  const owner: number[][] = Array.from({ length: WORLD_TILE_HEIGHT }, () => Array(WORLD_TILE_WIDTH).fill(-1));
  const queue: Array<[number, number]> = [];

  ROOMS.forEach((room, roomIndex) => {
    const { x, y, w, h } = room.tiles;
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (isWalkable(tx, ty)) {
          owner[ty][tx] = roomIndex;
          queue.push([tx, ty]);
        }
      }
    }
  });

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let head = 0; head < queue.length; head++) {
    const [tx, ty] = queue[head];
    for (const [dx, dy] of dirs) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (isWalkable(nx, ny) && owner[ny][nx] === -1) {
        owner[ny][nx] = owner[ty][tx];
        queue.push([nx, ny]);
      }
    }
  }

  return owner;
}

/** Merges the owner grid into per-room rects: horizontal runs per row, then stacked vertically wherever consecutive rows share the same owner, x and width. */
function ownerGridToRects(owner: number[][]): Array<{ roomIndex: number; rect: PixelRect }> {
  const rowRuns: Array<{ key: string; rect: PixelRect }> = [];
  for (let ty = 0; ty < owner.length; ty++) {
    const row = owner[ty];
    let runStart = -1;
    let runOwner = -1;
    for (let tx = 0; tx <= row.length; tx++) {
      const cellOwner = tx < row.length ? row[tx] : -1;
      const continues = cellOwner !== -1 && cellOwner === runOwner;
      if (continues) continue;
      if (runStart !== -1) {
        rowRuns.push({ key: String(runOwner), rect: { x: px(runStart), y: px(ty), w: px(tx - runStart), h: TILE_SIZE } });
      }
      runStart = cellOwner !== -1 ? tx : -1;
      runOwner = cellOwner;
    }
  }
  return mergeVerticalRuns(rowRuns).map(({ key, rect }) => ({ roomIndex: Number(key), rect }));
}

/**
 * Aligns a merged owner rect's edges to the true wall centerline wherever an
 * interior dividing wall separates it from a differently-owned neighbor —
 * e.g. the 1-tile gap row between Bedroom+Study and Garden, flood-filled
 * entirely to one side by assignFloorOwners (see its own doc comment).
 *
 * A wall's own drawn band sits centered in its gap tile (see
 * WALL_THICKNESS_PAD_PX / thinRect in wallSystem.ts) — pad in from each of
 * the tile's two faces, i.e. exactly straddling the tile's midline. So each
 * neighboring room's floor has to reach exactly that midline, not stop pad
 * short of its own face: the owning side (the one flood-fill actually
 * assigned the gap tile to) currently runs the tile's *full* TILE_SIZE past
 * its real boundary and must pull back by half a tile; the other side never
 * got the gap tile at all and must push out by half a tile to meet it.
 * Anything less (e.g. only pad) leaves a sliver — neither floor color nor
 * wall — showing raw background between them.
 *
 * World-outer-border edges are left alone (clampToHouseBorder/reopenEdges
 * handle those — there's no room on the far side to meet in the middle of).
 * An edge with any open tile along it (a doorway) is left alone too — real
 * doorway floor must stay continuous, and both branches below only ever
 * fire where the whole checked span is solid wall.
 */
function alignToWallCenterline(rect: PixelRect, wallGrid: boolean[][]): PixelRect {
  const half = TILE_SIZE / 2;
  const tx0 = rect.x / TILE_SIZE;
  const ty0 = rect.y / TILE_SIZE;
  const tx1 = (rect.x + rect.w) / TILE_SIZE;
  const ty1 = (rect.y + rect.h) / TILE_SIZE;

  const rowSolid = (ty: number) => {
    for (let tx = tx0; tx < tx1; tx++) if (!wallGrid[ty][tx]) return false;
    return true;
  };
  const colSolid = (tx: number) => {
    for (let ty = ty0; ty < ty1; ty++) if (!wallGrid[ty][tx]) return false;
    return true;
  };

  let { x, y, w, h } = rect;
  // North: ty0 itself solid -> this rect owns the gap row, pull back to its
  // centerline. Otherwise, if the row just above is solid and NOT owned by
  // this rect, that's the neighbor's gap row — push out to meet it there.
  if (ty0 > 0) {
    if (rowSolid(ty0)) {
      y += half;
      h -= half;
    } else if (ty0 - 1 > 0 && rowSolid(ty0 - 1)) {
      y -= half;
      h += half;
    }
  }
  // South: mirror of north.
  if (ty1 < WORLD_TILE_HEIGHT) {
    if (rowSolid(ty1 - 1)) {
      h -= half;
    } else if (ty1 < WORLD_TILE_HEIGHT - 1 && rowSolid(ty1)) {
      h += half;
    }
  }
  // West: mirror of north, on the x axis.
  if (tx0 > 0) {
    if (colSolid(tx0)) {
      x += half;
      w -= half;
    } else if (tx0 - 1 > 0 && colSolid(tx0 - 1)) {
      x -= half;
      w += half;
    }
  }
  // East: mirror of south, on the x axis.
  if (tx1 < WORLD_TILE_WIDTH) {
    if (colSolid(tx1 - 1)) {
      w -= half;
    } else if (tx1 < WORLD_TILE_WIDTH - 1 && colSolid(tx1)) {
      w += half;
    }
  }
  return { x, y, w, h };
}

/**
 * clampToHouseBorder insets every outer edge by the wall pad, on the
 * assumption a wall sits there to hide the inset gap. openExteriorEdges()
 * segments (e.g. Garden's south/east) draw no wall, so that assumption is
 * false there — push the clamped edge back out to the true world edge on
 * exactly those segments, using the pre-clamp `raw` rect's own tile bounds
 * to tell which edges qualify.
 */
function reopenEdges(raw: PixelRect, clamped: PixelRect): PixelRect {
  let { x, y, w, h } = clamped;
  const tx0 = raw.x / TILE_SIZE;
  const ty0 = raw.y / TILE_SIZE;
  const tx1 = (raw.x + raw.w) / TILE_SIZE;
  const ty1 = (raw.y + raw.h) / TILE_SIZE;

  for (const edge of openExteriorEdges()) {
    if (edge.axis === "row" && ty1 - 1 === edge.index && tx0 < edge.end && tx1 > edge.start) {
      h = px(edge.index + 1) - y;
    }
    if (edge.axis === "col" && tx1 - 1 === edge.index && ty0 < edge.end && ty1 > edge.start) {
      w = px(edge.index + 1) - x;
    }
  }
  return { x, y, w, h };
}

/** Spacing (world px) between drawn plank-seam lines — see drawFloorRect. 3 tiles reads as generously wide floorboards, not a repeating grid. */
const PLANK_SPACING_PX = TILE_SIZE * 3;

/**
 * Draws one merged floor rect as a flat, single-color fill with a few long
 * plank-seam lines running its full width — real wood grain feel with zero
 * repetition (unlike a tiled texture image, a line spanning the whole rect
 * can never show a seam or grid). Grass keeps its own procedural pattern;
 * it's outdoor ground, not a planked floor.
 */
function drawFloorRect(g: Phaser.GameObjects.Graphics, rect: PixelRect, room: RoomDef): void {
  g.fillStyle(room.floorColor, 1);
  g.fillPoints(floorQuad(rect.x, rect.y, rect.w, rect.h), true);
  if (room.floorType === "grass") {
    drawGrassPattern(g, rect.x, rect.y, rect.w, rect.h, room.floorColor);
    return;
  }
  g.lineStyle(1, darken(room.floorColor, 22), 0.35);
  for (let y = rect.y + PLANK_SPACING_PX; y < rect.y + rect.h; y += PLANK_SPACING_PX) {
    const a = project(rect.x, y);
    const b = project(rect.x + rect.w, y);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/**
 * Draws the whole house's floor as one continuous surface derived from the
 * unified walkable footprint (see assignFloorOwners) — replaces the old
 * one-quad-per-room approach that left the 1-tile gaps between rooms
 * (including every doorway) undrawn. Also draws each room's own soft
 * contact shadow under its north (back) wall.
 *
 * assignFloorOwners floods across the raw tile grid, including the
 * perimeter wall ring itself (intentionally, so floor still shows through
 * under an interior wall's own thin band — see its own doc comment). At the
 * house's outer edge there's no wall on the far side of that ring to hide
 * the rest of the tile, so each merged rect is clamped to the same
 * WALL_THICKNESS_PAD_PX-inset border the walls themselves draw flush
 * against (see wallSystem's clampToHouseBorder) — otherwise the outer ring
 * tile's far half rendered as floor visibly outside the walls.
 */
export function createHouseFloor(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const wallGrid = buildWallGrid();
  const owner = assignFloorOwners();

  const gBase = scene.add.graphics().setDepth(DEPTH.FLOOR);
  for (const { roomIndex, rect } of ownerGridToRects(owner)) {
    const neighborClipped = alignToWallCenterline(rect, wallGrid);
    const clipped = reopenEdges(rect, clampToHouseBorder(neighborClipped));
    if (clipped.w <= 0 || clipped.h <= 0) continue;
    drawFloorRect(gBase, clipped, ROOMS[roomIndex]);
  }
  objects.push(gBase);

  const gTop = scene.add.graphics().setDepth(DEPTH.FLOOR + 0.02);
  for (const room of ROOMS) {
    const x = px(room.tiles.x);
    const y = px(room.tiles.y);
    const w = px(room.tiles.w);
    gTop.fillStyle(0x000000, 0.16);
    gTop.fillPoints([project(x, y), project(x + w, y), project(x + w, y + 2), project(x, y + 2)], true);
  }
  for (const room of ROOMS) {
    if (room.floorType === "grass") drawGardenEdgeBorder(gTop, room);
  }
  objects.push(gTop);

  return objects;
}
