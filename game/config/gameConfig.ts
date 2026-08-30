import * as Phaser from "phaser";
import { BootScene } from "@/game/scenes/BootScene";
import { StudioScene } from "@/game/scenes/StudioScene";

// Logical view in world-units, sized to comfortably fit the whole (compact,
// single-floor) house at default zoom — see projectedSize() in
// game/world/projection.ts, ~504x284 for the current layout, plus margin.
// RENDER_SCALE multiplies both the framebuffer and the camera zoom so the
// same view renders at native high resolution instead of being CSS-upscaled
// from a tiny canvas (which is what made pixel-art edges look chunky/blurry).
const BASE_WIDTH = 560;
const BASE_HEIGHT = 315;
export const RENDER_SCALE = 6;
export const GAME_WIDTH = BASE_WIDTH * RENDER_SCALE;
export const GAME_HEIGHT = BASE_HEIGHT * RENDER_SCALE;

export function createGameConfig(
  parent: HTMLDivElement,
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    pixelArt: true,
    antialias: false,
    backgroundColor: "#2b1a12",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scale: {
      // ENVELOP (not FIT) so the canvas always covers the full viewport —
      // FIT preserves the fixed 560:315 aspect ratio and letterboxes
      // whichever axis doesn't match, which reads as the game "cutting off"
      // top/bottom on any window that isn't exactly 16:9.
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, StudioScene],
  };
}
