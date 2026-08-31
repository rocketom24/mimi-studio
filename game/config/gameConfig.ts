import * as Phaser from "phaser";
import { BootScene } from "@/game/scenes/BootScene";
import { StudioScene } from "@/game/scenes/StudioScene";

// Fallback game size for the very first frame, before RESIZE mode measures
// the real parent element — only matters if parent isn't laid out yet.
const FALLBACK_WIDTH = 960;
const FALLBACK_HEIGHT = 540;

export function createGameConfig(
  parent: HTMLDivElement,
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || FALLBACK_WIDTH,
    height: parent.clientHeight || FALLBACK_HEIGHT,
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
      // RESIZE keeps the canvas exactly matching its container at all
      // times (no fixed base resolution to crop against or letterbox
      // around) — StudioScene reads this.scale.width/height each frame and
      // recomputes the camera's fit-zoom on every resize (see
      // applyCameraFraming), so the whole house always fits without ever
      // cropping or overlapping regardless of viewport size/aspect.
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, StudioScene],
  };
}
