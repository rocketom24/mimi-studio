import * as Phaser from "phaser";
import { BootScene } from "@/game/scenes/BootScene";
import { StudioScene } from "@/game/scenes/StudioScene";

export const GAME_WIDTH = 320;
export const GAME_HEIGHT = 180;

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
    backgroundColor: "#1a1423",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, StudioScene],
  };
}
