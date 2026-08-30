import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import type { RoomDef } from "@/game/types/world";
import { createGameText, ROOM_LABEL_STYLE } from "@/game/ui/textStyles";
import { DEPTH } from "@/game/world/depth";
import { project } from "@/game/world/projection";

const px = (tiles: number) => tiles * TILE_SIZE;

/** Anchored over the room's north (back) top-center edge, in the fixed camera's screen space. */
export function createRoomLabel(scene: Phaser.Scene, room: RoomDef): Phaser.GameObjects.Text {
  const x = px(room.tiles.x);
  const y = px(room.tiles.y);
  const w = px(room.tiles.w);
  const anchor = project(x + w / 2, y + 1);
  return createGameText(scene, anchor.x, anchor.y, room.label, ROOM_LABEL_STYLE)
    .setOrigin(0.5, 0)
    .setDepth(DEPTH.LABEL_BASE + y)
    .setAlpha(0.95);
}
