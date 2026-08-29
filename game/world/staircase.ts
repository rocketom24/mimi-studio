import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { darken, lighten } from "@/game/world/palette";
import { DEPTH } from "@/game/world/depth";
import { project, toViewRect } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";
import type { StaircaseDef } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;
const STEP_COLOR = 0x4a3a63;
const NOOK_FLOOR_COLOR = 0x241c33;

/** Renders one stairwell nook: a plain floor patch distinct from any room's floor, plus 3 ascending step blocks against its back edge to read as "going upstairs." */
export function createStaircaseVisual(scene: Phaser.Scene, stair: StaircaseDef, orientation: ViewOrientation): Phaser.GameObjects.Graphics {
  const x = px(stair.tiles.x);
  const y = px(stair.tiles.y);
  const w = px(stair.tiles.w);
  const h = px(stair.tiles.h);

  const g = scene.add.graphics().setDepth(DEPTH.FLOOR);
  const floorView = toViewRect({ x, y, w, h }, orientation);
  const nw = project(floorView.x, floorView.y);
  const ne = project(floorView.x + floorView.w, floorView.y);
  const se = project(floorView.x + floorView.w, floorView.y + floorView.h);
  const sw = project(floorView.x, floorView.y + floorView.h);
  g.fillStyle(NOOK_FLOOR_COLOR, 1);
  g.fillPoints([nw, ne, se, sw], true);

  const stepCount = 3;
  const stepDepth = h / stepCount;
  for (let i = 0; i < stepCount; i++) {
    const stepRect = { x, y: y + i * stepDepth, w, h: stepDepth };
    const view = toViewRect(stepRect, orientation);
    const stepColor = i % 2 === 0 ? lighten(STEP_COLOR, 8) : darken(STEP_COLOR, 8);
    const riseZ = (stepCount - i) * 3;
    const topLeft = project(view.x, view.y, riseZ);
    const topRight = project(view.x + view.w, view.y, riseZ);
    const bottomRight = project(view.x + view.w, view.y + view.h, riseZ);
    const bottomLeft = project(view.x, view.y + view.h, riseZ);
    g.fillStyle(stepColor, 1);
    g.fillPoints([topLeft, topRight, bottomRight, bottomLeft], true);
  }

  return g;
}

/** Whether a world-pixel point sits inside a staircase's trigger footprint. */
export function isOnStaircase(stair: StaircaseDef, worldX: number, worldY: number): boolean {
  const x = px(stair.trigger.x);
  const y = px(stair.trigger.y);
  return worldX >= x && worldX < x + px(stair.trigger.w) && worldY >= y && worldY < y + px(stair.trigger.h);
}
