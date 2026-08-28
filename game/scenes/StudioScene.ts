import * as Phaser from "phaser";
import { WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
import { ROOMS } from "@/game/world/rooms";
import {
  createFurniture,
  createRoom,
  createRoomLabel,
  createStudioBackground,
  createWalls,
} from "@/game/world/studioWorld";

export class StudioScene extends Phaser.Scene {
  constructor() {
    super("StudioScene");
  }

  create(): void {
    createStudioBackground(this);
    createWalls(this);

    for (const room of ROOMS) {
      createRoom(this, room);
      createFurniture(this, room);
      createRoomLabel(this, room);
    }

    this.cameras.main.setBounds(0, 0, WORLD_PIXEL_WIDTH, WORLD_PIXEL_HEIGHT);
    this.cameras.main.centerOn(WORLD_PIXEL_WIDTH / 2, WORLD_PIXEL_HEIGHT / 2);
  }
}
