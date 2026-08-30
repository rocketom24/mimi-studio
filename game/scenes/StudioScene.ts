import * as Phaser from "phaser";
import { WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from "@/game/config/gameConfig";
import { getCameraMode, projectedSize, toggleCameraMode } from "@/game/world/projection";
import { ROOMS } from "@/game/world/rooms";
import { createRoomLabel } from "@/game/world/studioWorld";
import { createHouseFloor } from "@/game/world/floorSystem";
import { createWalls, createWindows, type WallSegment } from "@/game/world/wallSystem";
import { createDoors, updateDoors, type DoorSegment } from "@/game/world/doorSystem";
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

// House projects to ~504x284 world-units (see projectedSize()) inside a
// 560x315 canvas — camera bounds already equal the house exactly (no slack),
// so zooming out just reveals background void beyond the house, it never
// reveals more world. 0.89 is the lowest factor that still fills ~80% of
// the canvas with the house (0.5 used to shrink it to ~45%, mostly void).
const ZOOM_MIN = 0.89;
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
  private doorSegments: DoorSegment[] = [];
  /** Every static level Graphics/Text object, so a camera-mode toggle can destroy and redraw them under the new projection instead of leaking the old ones. */
  private levelObjects: Phaser.GameObjects.GameObject[] = [];
  private zoomFactor = 1;

  constructor() {
    super("StudioScene");
  }

  create(): void {
    this.buildLevel();
    (window as unknown as { __scene?: Phaser.Scene }).__scene = this;

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
    updateDoors(this, this.doorSegments, this.player.worldX, this.player.worldY);
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
    for (const segment of this.doorSegments) segment.tween?.stop();
    for (const obj of this.levelObjects) obj.destroy();
    this.levelObjects = [];

    this.levelObjects.push(createHouseFloor(this));

    this.wallSegments = createWalls(this);
    this.levelObjects.push(...this.wallSegments.map((segment) => segment.graphics));
    for (const room of ROOMS) {
      const windows = createWindows(this, room);
      if (windows) this.levelObjects.push(windows);
    }
    this.doorSegments = createDoors(this);
    this.levelObjects.push(...this.doorSegments.map((segment) => segment.graphics));
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
    const bounds = this.computeCameraBounds();
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.cameras.main.setZoom(RENDER_SCALE * this.zoomFactor);
  }

  /**
   * Phaser pins camera scroll to the bounds' top-left corner whenever the
   * viewport is larger than the bounds (min zoom, house smaller than the
   * screen) — it never centers a too-small world on its own. Padding the
   * bounds out symmetrically to at least viewport size, centered on the
   * house, makes that same clamp land the house in the middle instead.
   * When the viewport is smaller than the house (zoomed in), this collapses
   * back to the house's exact extent so normal follow-cam panning is unaffected.
   */
  private computeCameraBounds(): { x: number; y: number; width: number; height: number } {
    const size = projectedSize();
    const viewWidth = GAME_WIDTH / (RENDER_SCALE * this.zoomFactor);
    const viewHeight = GAME_HEIGHT / (RENDER_SCALE * this.zoomFactor);
    const width = Math.max(size.width, viewWidth);
    const height = Math.max(size.height, viewHeight);
    return { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height };
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
    const bounds = this.computeCameraBounds();
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.cameras.main.setZoom(RENDER_SCALE * this.zoomFactor);
    (window as unknown as { __CAM_DEBUG__?: unknown }).__CAM_DEBUG__ = {
      zoomFactor: this.zoomFactor,
      cameraZoom: this.cameras.main.zoom,
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
      worldView: { ...this.cameras.main.worldView },
    };
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
