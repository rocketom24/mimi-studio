import * as Phaser from "phaser";

export class StudioScene extends Phaser.Scene {
  constructor() {
    super("StudioScene");
  }

  create(): void {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor("#1a1423");

    const floor = this.add.graphics();
    floor.fillStyle(0x2e2440, 1);
    floor.fillRect(20, height - 60, width - 40, 40);
    floor.lineStyle(2, 0x6f5c9e, 1);
    floor.strokeRect(20, height - 60, width - 40, 40);

    this.add
      .text(width / 2, height / 2 - 20, "MIMI STUDIO", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#f2e9ff",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 6, "Phaser 3 is running", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#a692cf",
      })
      .setOrigin(0.5);
  }
}
