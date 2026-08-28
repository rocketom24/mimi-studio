import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import type { RoomDef } from "@/game/types/world";
import { createGameText, ROOM_LABEL_STYLE } from "@/game/ui/textStyles";
import { DEPTH } from "@/game/world/depth";
import { project, toViewRect } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";

const px = (tiles: number) => tiles * TILE_SIZE;

/**
 * Text stays upright/readable at every orientation — only its anchor
 * position rotates with the room. The anchor is the room's near-the-back
 * top-center edge in VIEW space (via toViewRect, exact for an axis-aligned
 * rect under a 90° rotation): at orientation 0 that's the world-north edge
 * (matching the pre-rotation label placement exactly), but at 90/180/270 the
 * "back" wall is a different world edge, so re-deriving it from the rotated
 * room rect — instead of always reading world-north — keeps the label
 * anchored to the room's back edge (not floating over its front/furniture)
 * at every orientation.
 */
export function createRoomLabel(scene: Phaser.Scene, room: RoomDef, orientation: ViewOrientation): Phaser.GameObjects.Text {
  const worldRect = { x: px(room.tiles.x), y: px(room.tiles.y), w: px(room.tiles.w), h: px(room.tiles.h) };
  const view = toViewRect(worldRect, orientation);
  const anchor = project(view.x + view.w / 2, view.y + 1);
  return createGameText(scene, anchor.x, anchor.y, room.label, ROOM_LABEL_STYLE)
    .setOrigin(0.5, 0)
    .setDepth(DEPTH.LABEL_BASE + view.y)
    .setAlpha(0.95);
}
