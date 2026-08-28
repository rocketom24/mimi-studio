import * as Phaser from "phaser";
import type { InputSource, MovementIntent } from "@/game/types/input";

const CODES = Phaser.Input.Keyboard.KeyCodes;

/** WASD + arrow keys, both schemes active simultaneously. */
export class KeyboardInput implements InputSource {
  private readonly up: Phaser.Input.Keyboard.Key[];
  private readonly down: Phaser.Input.Keyboard.Key[];
  private readonly left: Phaser.Input.Keyboard.Key[];
  private readonly right: Phaser.Input.Keyboard.Key[];

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error("Keyboard input plugin is not available");

    this.up = [keyboard.addKey(CODES.W), keyboard.addKey(CODES.UP)];
    this.down = [keyboard.addKey(CODES.S), keyboard.addKey(CODES.DOWN)];
    this.left = [keyboard.addKey(CODES.A), keyboard.addKey(CODES.LEFT)];
    this.right = [keyboard.addKey(CODES.D), keyboard.addKey(CODES.RIGHT)];
  }

  getIntent(): MovementIntent {
    return {
      up: this.up.some((key) => key.isDown),
      down: this.down.some((key) => key.isDown),
      left: this.left.some((key) => key.isDown),
      right: this.right.some((key) => key.isDown),
    };
  }
}
