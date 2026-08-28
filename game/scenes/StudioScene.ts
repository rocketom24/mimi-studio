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
import { createWorldCollision } from "@/game/world/collision";
import { Player, PLAYER_SPAWN_X, PLAYER_SPAWN_Y } from "@/game/entities/Player";
import { InteractionSystem, INTERACTION_EVENTS } from "@/game/interactions/InteractionSystem";
import { InteractionPrompt } from "@/game/interactions/InteractionPrompt";
import { INTERACTABLES } from "@/game/data/interactables";
import { GAME_EVENTS, SCENE_EVENTS } from "@/game/types/interaction";
import type { Interactable } from "@/game/types/interaction";

export class StudioScene extends Phaser.Scene {
  player!: Player;
  private interactionSystem!: InteractionSystem;
  private interactionPrompt!: InteractionPrompt;
  private inputLocked = false;

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

    this.physics.world.setBounds(0, 0, WORLD_PIXEL_WIDTH, WORLD_PIXEL_HEIGHT);
    const collision = createWorldCollision(this);

    this.player = new Player(this, PLAYER_SPAWN_X, PLAYER_SPAWN_Y);
    this.physics.add.collider(this.player.sprite, collision);

    this.cameras.main.setBounds(0, 0, WORLD_PIXEL_WIDTH, WORLD_PIXEL_HEIGHT);
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(48, 28);

    this.interactionSystem = new InteractionSystem(this, INTERACTABLES);
    this.interactionPrompt = new InteractionPrompt(this, this.interactionSystem, this.player);
    this.interactionSystem.on(INTERACTION_EVENTS.Open, this.handleInteractionOpen, this);

    this.input.keyboard?.on("keydown-ESC", this.handleEscape, this);

    this.game.events.emit(GAME_EVENTS.StudioReady, this);
  }

  update(): void {
    if (this.inputLocked) return;
    this.player.update();
    this.interactionSystem.update(this.player.sprite.x, this.player.sprite.y);
    this.interactionPrompt.update();
  }

  /** Called by React when a portfolio panel is closed via its own close button (not ESC). */
  unlockInput(): void {
    this.inputLocked = false;
  }

  private handleInteractionOpen(interactable: Interactable): void {
    this.inputLocked = true;
    this.player.stop();
    this.events.emit(SCENE_EVENTS.InteractionOpen, interactable.panelId);
  }

  private handleEscape(): void {
    if (!this.inputLocked) return;
    this.inputLocked = false;
    this.events.emit(SCENE_EVENTS.InteractionClose);
  }
}
