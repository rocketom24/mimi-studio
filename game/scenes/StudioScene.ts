import * as Phaser from "phaser";
import { WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
import { RENDER_SCALE } from "@/game/config/gameConfig";
import { getCameraMode, projectedSize, toggleCameraMode } from "@/game/world/projection";
import { ROOMS } from "@/game/world/rooms";
import { createRoomLabel } from "@/game/world/studioWorld";
import { createHouseFloor } from "@/game/world/floorSystem";
import { createDoorDecorations, createWalls, createWindows, type WallSegment } from "@/game/world/wallSystem";
import { createFurniture } from "@/game/world/furnitureSystem";
import { createWorldCollision } from "@/game/world/collision";
import { updateWallOcclusion } from "@/game/world/occlusionSystem";
import { Player, PLAYER_SPAWN_X, PLAYER_SPAWN_Y } from "@/game/entities/Player";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import { TouchInput } from "@/game/input/TouchInput";
import { CombinedInput } from "@/game/input/CombinedInput";
import { InteractionSystem, INTERACTION_EVENTS } from "@/game/interactions/InteractionSystem";
import { InteractionPrompt } from "@/game/interactions/InteractionPrompt";
import { INTERACTABLES } from "@/game/data/interactables";
import { GAME_EVENTS, SCENE_EVENTS } from "@/game/types/interaction";
import type { Interactable } from "@/game/types/interaction";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

export class StudioScene extends Phaser.Scene {
  player!: Player;
  /** Written by the mobile D-pad overlay; read by Player alongside KeyboardInput. */
  readonly touchInput = new TouchInput();
  private interactionSystem!: InteractionSystem;
  private interactionPrompt!: InteractionPrompt;
  private inputLocked = false;
  private wallSegments: WallSegment[] = [];
  /** Every static level Graphics/Text object, so a camera-mode toggle can destroy and redraw them under the new projection instead of leaking the old ones. */
  private levelObjects: Phaser.GameObjects.GameObject[] = [];
  private zoomFactor = 1;

  constructor() {
    super("StudioScene");
  }

  create(): void {
    this.buildLevel();

    this.physics.world.setBounds(0, 0, WORLD_PIXEL_WIDTH, WORLD_PIXEL_HEIGHT);

    const input = new CombinedInput([new KeyboardInput(this), this.touchInput]);
    this.player = new Player(this, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, input);

    const collisionGroup = createWorldCollision(this);
    this.physics.add.collider(this.player.sprite, collisionGroup);

    this.applyCameraFraming();
    this.cameras.main.startFollow(this.player.visual, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(48, 28);

    this.input.keyboard?.on("keydown-Q", this.toggleCamera, this);
    this.input.keyboard?.on("keydown", this.handleZoomKey, this);
    this.input.on("wheel", this.handleWheelZoom, this);

    this.interactionSystem = new InteractionSystem(this, INTERACTABLES);
    this.interactionPrompt = new InteractionPrompt(this, this.interactionSystem, this.player);
    this.interactionSystem.on(INTERACTION_EVENTS.Open, this.handleInteractionOpen, this);
    this.interactionSystem.on(
      INTERACTION_EVENTS.Prompt,
      (interactable: Interactable | null) => this.events.emit(SCENE_EVENTS.InteractionPromptChange, interactable),
      this,
    );

    this.input.keyboard?.on("keydown-ESC", this.handleEscape, this);

    this.game.events.emit(GAME_EVENTS.StudioReady, this);
  }

  update(): void {
    if (this.inputLocked) return;

    this.player.update();
    // Only the isometric camera has a "wall between camera and player"
    // concept to fade — top-down looks straight down, so every wall stays
    // fully visible there (buildLevel() already redraws fresh, alpha=1
    // walls on every mode toggle).
    if (getCameraMode() === "isometric") {
      updateWallOcclusion(this.wallSegments, this.player.worldX, this.player.worldY);
    }
    this.interactionSystem.update(this.player.worldX, this.player.worldY);
    this.interactionPrompt.update();
  }

  /** Called by React when a portfolio panel is closed via its own close button (not ESC). */
  unlockInput(): void {
    this.inputLocked = false;
  }

  /** Called by the mobile [E] button — same trigger the keyboard E key uses internally. */
  interact(): void {
    if (this.inputLocked) return;
    this.interactionSystem.interact();
  }

  /**
   * Builds the house's static geometry. Called once up front, and again on
   * every camera-mode toggle: every drawable derives its screen position by
   * calling project(), so redrawing after toggleCameraMode() is the only
   * way to move it to the new projection — the room/wall/door data these
   * calls read from (ROOMS, buildWallGrid) is identical either way.
   */
  private buildLevel(): void {
    for (const obj of this.levelObjects) obj.destroy();
    this.levelObjects = [];

    this.levelObjects.push(createHouseFloor(this));

    this.wallSegments = createWalls(this);
    this.levelObjects.push(...this.wallSegments.map((segment) => segment.graphics));
    this.levelObjects.push(createDoorDecorations(this));
    for (const room of ROOMS) {
      const windows = createWindows(this, room);
      if (windows) this.levelObjects.push(windows);
    }
    for (const room of ROOMS) {
      this.levelObjects.push(...createFurniture(this, room));
      this.levelObjects.push(createRoomLabel(this, room));
    }
  }

  /** Q: swap the fixed camera projection (isometric <-> top-down) and redraw the level under it. Never rotates the house — see buildLevel(). */
  private toggleCamera(): void {
    toggleCameraMode();
    this.buildLevel();
    this.applyCameraFraming();
    this.player.reprojectVisual();
  }

  /** Recomputes camera bounds from the active projection's extent and reapplies zoom, so toggling mode or zooming never crops the house. */
  private applyCameraFraming(): void {
    const size = projectedSize();
    this.cameras.main.setBounds(0, 0, size.width, size.height);
    this.cameras.main.setZoom(RENDER_SCALE * this.zoomFactor);
  }

  private handleZoomKey(event: KeyboardEvent): void {
    if (event.code === "Equal" || event.code === "NumpadAdd") this.adjustZoom(ZOOM_STEP);
    else if (event.code === "Minus" || event.code === "NumpadSubtract") this.adjustZoom(-ZOOM_STEP);
  }

  private handleWheelZoom(_pointer: Phaser.Input.Pointer, _objects: unknown, _deltaX: number, deltaY: number): void {
    this.adjustZoom(deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  }

  private adjustZoom(delta: number): void {
    this.zoomFactor = Phaser.Math.Clamp(this.zoomFactor + delta, ZOOM_MIN, ZOOM_MAX);
    this.cameras.main.setZoom(RENDER_SCALE * this.zoomFactor);
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
