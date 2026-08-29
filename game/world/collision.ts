import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { ROOMS } from "@/game/world/rooms";
import { computeWallRects } from "@/game/world/wallSystem";
import type { Level } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;

function addStaticRect(
  scene: Phaser.Scene,
  group: Phaser.Physics.Arcade.StaticGroup,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const rect = scene.add.rectangle(x + w / 2, y + h / 2, w, h);
  rect.setVisible(false);
  scene.physics.add.existing(rect, true);
  group.add(rect);
}

/**
 * Builds the static collision geometry for the studio: every wall segment
 * plus solid furniture. Walls are derived from computeWallRects() so they
 * can never drift from what's drawn; furniture pieces opt out via `solid: false`.
 */
export function createWorldCollision(scene: Phaser.Scene, level: Level): Phaser.Physics.Arcade.StaticGroup {
  const group = scene.physics.add.staticGroup();

  for (const rect of computeWallRects(level)) {
    addStaticRect(scene, group, rect.x, rect.y, rect.w, rect.h);
  }

  for (const room of ROOMS.filter((r) => r.level === level)) {
    for (const piece of room.furniture) {
      if (piece.solid === false) continue;
      addStaticRect(
        scene,
        group,
        px(room.tiles.x) + px(piece.x),
        px(room.tiles.y) + px(piece.y),
        px(piece.w),
        px(piece.h),
      );
    }
  }

  return group;
}

/** Both levels' collision bodies are built once at scene creation and live in the same 0-512x0-288 world space; only the active level's bodies should ever block the player. */
export function setGroupEnabled(group: Phaser.Physics.Arcade.StaticGroup, enabled: boolean): void {
  group.children.iterate((child) => {
    const body = (child as Phaser.GameObjects.GameObject & { body: Phaser.Physics.Arcade.StaticBody }).body;
    body.enable = enabled;
    return true;
  });
}
