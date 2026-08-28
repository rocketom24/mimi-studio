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
    // Frame the world's top-left corner rather than centering on Mimi: at her
    // spawn point, centering scrolls the view down far enough to crop Entry's
    // north wall and label above the viewport. This shows all of Entry, Mimi,
    // and the path into the corridor.
    this.cameras.main.setScroll(0, 0);
  }
}
