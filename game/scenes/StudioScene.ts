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
import { Player, PLAYER_SPAWN_X, PLAYER_SPAWN_Y } from "@/game/entities/Player";

export class StudioScene extends Phaser.Scene {
  player!: Player;

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

    this.player = new Player(this, PLAYER_SPAWN_X, PLAYER_SPAWN_Y);

    this.cameras.main.setBounds(0, 0, WORLD_PIXEL_WIDTH, WORLD_PIXEL_HEIGHT);
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(48, 28);
  }

  update(_time: number, delta: number): void {
    this.player.update(delta);
  }
}
