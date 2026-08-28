import * as Phaser from "phaser";
import { TILE_SIZE, WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
import { darken, lighten } from "@/game/world/palette";
import { DEPTH } from "@/game/world/depth";
import { project, projectOriented, toViewRect } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";
import type { RoomDef } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;

/** Projected quad (parallelogram) for a floor-plane rect — corners only, z=0. */
function floorQuad(x: number, y: number, w: number, h: number, orientation: ViewOrientation): Phaser.Types.Math.Vector2Like[] {
  return [
    projectOriented(x, y, orientation),
    projectOriented(x + w, y, orientation),
    projectOriented(x + w, y + h, orientation),
    projectOriented(x, y + h, orientation),
  ];
}

/** Subtle wood plank seams: one thin darker line per tile row. Horizontal world lines stay horizontal on screen (at VIEW 0; rotation reprojects them coherently). */
function drawWoodPattern(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, base: number, orientation: ViewOrientation): void {
  g.lineStyle(1, darken(base, 14), 0.35);
  for (let ty = y + TILE_SIZE; ty < y + h; ty += TILE_SIZE) {
    const a = projectOriented(x, ty, orientation);
    const b = projectOriented(x + w, ty, orientation);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/** Subtle tile grout grid. */
function drawTilePattern(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, base: number, orientation: ViewOrientation): void {
  g.lineStyle(1, lighten(base, 10), 0.3);
  for (let tx = x + TILE_SIZE; tx < x + w; tx += TILE_SIZE) {
    const a = projectOriented(tx, y, orientation);
    const b = projectOriented(tx, y + h, orientation);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  for (let ty = y + TILE_SIZE; ty < y + h; ty += TILE_SIZE) {
    const a = projectOriented(x, ty, orientation);
    const b = projectOriented(x + w, ty, orientation);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/** Coarser slab seams for the workshop/game-room floor. */
function drawWorkshopPattern(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, base: number, orientation: ViewOrientation): void {
  const step = TILE_SIZE * 2;
  g.lineStyle(1, darken(base, 18), 0.3);
  for (let tx = x + step; tx < x + w; tx += step) {
    const a = projectOriented(tx, y, orientation);
    const b = projectOriented(tx, y + h, orientation);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  for (let ty = y + step; ty < y + h; ty += step) {
    const a = projectOriented(x, ty, orientation);
    const b = projectOriented(x + w, ty, orientation);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

export function createRoomFloor(scene: Phaser.Scene, room: RoomDef, orientation: ViewOrientation): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DEPTH.FLOOR);
  const x = px(room.tiles.x);
  const y = px(room.tiles.y);
  const w = px(room.tiles.w);
  const h = px(room.tiles.h);

  g.fillStyle(room.floorColor, 1);
  g.fillPoints(floorQuad(x, y, w, h, orientation), true);

  if (room.floorType === "wood") drawWoodPattern(g, x, y, w, h, room.floorColor, orientation);
  else if (room.floorType === "tile") drawTilePattern(g, x, y, w, h, room.floorColor, orientation);
  else drawWorkshopPattern(g, x, y, w, h, room.floorColor, orientation);

  // Soft contact shadow where the room's back wall face looms over the
  // floor. "Back" is whichever world edge maps to the smallest view-space Y
  // for the current orientation (toViewRect's min-Y edge) — a fixed
  // world-north strip only happens to be correct at orientation 0.
  const roomView = toViewRect({ x, y, w, h }, orientation);
  g.fillStyle(0x000000, 0.16);
  g.fillPoints(
    [
      project(roomView.x, roomView.y),
      project(roomView.x + roomView.w, roomView.y),
      project(roomView.x + roomView.w, roomView.y + 2),
      project(roomView.x, roomView.y + 2),
    ],
    true,
  );

  return g;
}

/** Sparse dot pattern for the central corridor, distinct from every room floor. */
export function createCorridorFloor(scene: Phaser.Scene, baseColor: number, orientation: ViewOrientation): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DEPTH.FLOOR);
  g.fillStyle(baseColor, 1);
  g.fillPoints(floorQuad(0, 0, WORLD_PIXEL_WIDTH, WORLD_PIXEL_HEIGHT, orientation), true);

  g.fillStyle(lighten(baseColor, 14), 0.25);
  const step = TILE_SIZE * 2;
  for (let wx = step; wx < WORLD_PIXEL_WIDTH; wx += step) {
    for (let wy = step; wy < WORLD_PIXEL_HEIGHT; wy += step) {
      const p = projectOriented(wx, wy, orientation);
      g.fillRect(p.x, p.y, 1, 1);
    }
  }

  return g;
}
