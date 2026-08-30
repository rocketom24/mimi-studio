import * as Phaser from "phaser";
import { TILE_SIZE, WORLD_TILE_HEIGHT, WORLD_TILE_WIDTH } from "@/game/config/world";
import { darken, lighten } from "@/game/world/palette";
import { DEPTH } from "@/game/world/depth";
import { project } from "@/game/world/projection";
import { ROOMS } from "@/game/world/rooms";
import { buildWallGrid } from "@/game/world/wallSystem";
import { mergeVerticalRuns } from "@/game/world/gridRects";
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

/** Tile-space bounding box spanning every room's footprint — the house's overall walkable envelope. */
function computeHouseBounds() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const room of ROOMS) {
    minX = Math.min(minX, room.tiles.x);
    minY = Math.min(minY, room.tiles.y);
    maxX = Math.max(maxX, room.tiles.x + room.tiles.w);
    maxY = Math.max(maxY, room.tiles.y + room.tiles.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Assigns every walkable tile to a room index, so the floor can be drawn
 * from the same unified footprint the walls already use instead of one quad
 * per declared room rect. A tile is walkable if it sits inside the house's
 * bounding envelope and isn't a wall tile (buildWallGrid — the same grid
 * collision and wall drawing use, so a tile can never be "floor" and "wall"
 * at once). Tiles inside a room's own declared rect get that room directly;
 * any leftover walkable tile — a 1-tile gap between two rooms, punched open
 * by a door — has no room of its own, so it's assigned via flood fill from
 * its nearest owned neighbor. That's what makes every doorway and corridor
 * get real floor instead of the bare background showing through.
 */
function assignFloorOwners(): number[][] {
  const bounds = computeHouseBounds();
  const wallGrid = buildWallGrid();
  const isWalkable = (tx: number, ty: number) =>
    tx >= bounds.x && tx < bounds.x + bounds.w && ty >= bounds.y && ty < bounds.y + bounds.h && !wallGrid[ty][tx];

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
 */
export function createHouseFloor(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DEPTH.FLOOR);

  for (const { roomIndex, rect } of ownerGridToRects(assignFloorOwners())) {
    drawFloorRect(g, rect, ROOMS[roomIndex]);
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
