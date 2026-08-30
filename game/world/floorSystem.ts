import * as Phaser from "phaser";
import { TILE_SIZE, WORLD_TILE_HEIGHT, WORLD_TILE_WIDTH } from "@/game/config/world";
import { darken, lighten } from "@/game/world/palette";
import { DEPTH } from "@/game/world/depth";
import { project } from "@/game/world/projection";
import { ROOMS } from "@/game/world/rooms";
import { mergeVerticalRuns } from "@/game/world/gridRects";
import { clampToHouseBorder } from "@/game/world/wallSystem";
import type { PixelRect, RoomDef } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;

/** Projected quad (parallelogram) for a floor-plane rect — corners only, z=0. */
function floorQuad(x: number, y: number, w: number, h: number): Phaser.Types.Math.Vector2Like[] {
  return [project(x, y), project(x + w, y), project(x + w, y + h), project(x, y + h)];
}

/** Subtle wood plank seams: one thin darker line per tile row. */
function drawWoodPattern(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, base: number): void {
  g.lineStyle(1, darken(base, 14), 0.35);
  for (let ty = y + TILE_SIZE; ty < y + h; ty += TILE_SIZE) {
    const a = project(x, ty);
    const b = project(x + w, ty);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/** Subtle tile grout grid. */
function drawTilePattern(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, base: number): void {
  g.lineStyle(1, lighten(base, 10), 0.3);
  for (let tx = x + TILE_SIZE; tx < x + w; tx += TILE_SIZE) {
    const a = project(tx, y);
    const b = project(tx, y + h);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  for (let ty = y + TILE_SIZE; ty < y + h; ty += TILE_SIZE) {
    const a = project(x, ty);
    const b = project(x + w, ty);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/** Coarser slab seams for the workshop/game-room floor. */
function drawWorkshopPattern(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, base: number): void {
  const step = TILE_SIZE * 2;
  g.lineStyle(1, darken(base, 18), 0.3);
  for (let tx = x + step; tx < x + w; tx += step) {
    const a = project(tx, y);
    const b = project(tx, y + h);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  for (let ty = y + step; ty < y + h; ty += step) {
    const a = project(x, ty);
    const b = project(x + w, ty);
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

/** Draws one merged floor rect: fill, then the room's plank/grout/slab pattern within that rect's own bounds. */
function drawFloorRect(g: Phaser.GameObjects.Graphics, rect: PixelRect, room: RoomDef): void {
  g.fillStyle(room.floorColor, 1);
  g.fillPoints(floorQuad(rect.x, rect.y, rect.w, rect.h), true);

  if (room.floorType === "wood") drawWoodPattern(g, rect.x, rect.y, rect.w, rect.h, room.floorColor);
  else if (room.floorType === "tile") drawTilePattern(g, rect.x, rect.y, rect.w, rect.h, room.floorColor);
  else drawWorkshopPattern(g, rect.x, rect.y, rect.w, rect.h, room.floorColor);
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
export function createHouseFloor(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DEPTH.FLOOR);

  for (const { roomIndex, rect } of ownerGridToRects(assignFloorOwners())) {
    const clipped = clampToHouseBorder(rect);
    if (clipped.w <= 0 || clipped.h <= 0) continue;
    drawFloorRect(g, clipped, ROOMS[roomIndex]);
  }

  for (const room of ROOMS) {
    const x = px(room.tiles.x);
    const y = px(room.tiles.y);
    const w = px(room.tiles.w);
    g.fillStyle(0x000000, 0.16);
    g.fillPoints([project(x, y), project(x + w, y), project(x + w, y + 2), project(x, y + 2)], true);
  }

  return g;
}
