import * as Phaser from "phaser";
import { WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
import { ORIENTATIONS, projectedSizeFor } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";
import { ROOMS, STAIRCASES, roomAt } from "@/game/world/rooms";
import { LEVELS } from "@/game/types/world";
import type { Level } from "@/game/types/world";
import { createRoomLabel } from "@/game/world/studioWorld";
import { createRoomFloor } from "@/game/world/floorSystem";
import { createDoorDecorations, createWalls, createWindows, type WallSegment } from "@/game/world/wallSystem";
import { createFurniture } from "@/game/world/furnitureSystem";
import { createWorldCollision, setGroupEnabled } from "@/game/world/collision";
import { createStaircaseVisual } from "@/game/world/staircase";
import { updateWallOcclusion } from "@/game/world/occlusionSystem";
import { CameraController, CAMERA_EVENTS, type RotateStartPayload } from "@/game/world/cameraController";
import { Player, PLAYER_SPAWN_X, PLAYER_SPAWN_Y } from "@/game/entities/Player";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import { TouchInput } from "@/game/input/TouchInput";
import { CombinedInput } from "@/game/input/CombinedInput";
import { InteractionSystem, INTERACTION_EVENTS } from "@/game/interactions/InteractionSystem";
import { InteractionPrompt } from "@/game/interactions/InteractionPrompt";
import { INTERACTABLES } from "@/game/data/interactables";
import { GAME_EVENTS, SCENE_EVENTS } from "@/game/types/interaction";
import type { Interactable } from "@/game/types/interaction";

type LayerObject = Phaser.GameObjects.Graphics | Phaser.GameObjects.Text;
interface TrackedObject {
  obj: LayerObject;
  baseX: number;
  baseY: number;
  baseDepth: number;
}

/**
 * Depth bias applied to whichever layer is currently the larger (nearer) of
 * the two during a rotation fold, so it draws cleanly over the smaller one
 * instead of the two layers' individually Y-sorted objects interleaving.
 * Far above DEPTH.PROMPT (5000) — the only other thing on screen — with
 * headroom to spare.
 */
const FOLD_TOP_DEPTH_BIAS = 100_000;

export class StudioScene extends Phaser.Scene {
  player!: Player;
  /** Written by the mobile D-pad overlay; read by Player alongside KeyboardInput. */
  readonly touchInput = new TouchInput();
  private cameraController!: CameraController;
  private readonly interactionSystems = new Map<Level, InteractionSystem>();
  private readonly interactionPrompts = new Map<Level, InteractionPrompt>();

  private get activeInteractionSystem(): InteractionSystem {
    return this.interactionSystems.get(this.activeLevel)!;
  }

  private get activeInteractionPrompt(): InteractionPrompt {
    return this.interactionPrompts.get(this.activeLevel)!;
  }
  private inputLocked = false;
  /** Shared vertical hinge (world/projected X) both layers fold toward during a rotation — captured once per rotation so it doesn't drift as the camera nudges. */
  private rotationPivotX = 0;
  private activeLevel: Level = 0;
  private readonly collisionGroups = new Map<Level, Phaser.Physics.Arcade.StaticGroup>();
  private readonly layerObjects = new Map<string, TrackedObject[]>();
  private readonly wallSegmentsByOrientation = new Map<string, WallSegment[]>();

  private layerKey(level: Level, orientation: ViewOrientation): string {
    return `${level}:${orientation}`;
  }

  constructor() {
    super("StudioScene");
  }

  create(): void {
    this.cameraController = new CameraController(this);
    this.buildOrientationLayers();

    this.physics.world.setBounds(0, 0, WORLD_PIXEL_WIDTH, WORLD_PIXEL_HEIGHT);

    const input = new CombinedInput([new KeyboardInput(this), this.touchInput]);
    this.player = new Player(this, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, input);

    for (const level of LEVELS) {
      const group = createWorldCollision(this, level);
      setGroupEnabled(group, level === this.activeLevel);
      this.collisionGroups.set(level, group);
      this.physics.add.collider(this.player.sprite, group);
    }

    const size = projectedSizeFor(this.cameraController.getOrientation());
    this.cameras.main.setBounds(0, 0, size.width, size.height);
    this.cameras.main.startFollow(this.player.visual, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(48, 28);

    for (const level of LEVELS) {
      const levelInteractables = INTERACTABLES.filter((i) => roomAt(i.x, i.y)?.level === level);
      const system = new InteractionSystem(this, levelInteractables);
      const prompt = new InteractionPrompt(this, system, this.player);
      system.on(INTERACTION_EVENTS.Open, this.handleInteractionOpen, this);
      system.on(
        INTERACTION_EVENTS.Prompt,
        (interactable: Interactable | null) => this.events.emit(SCENE_EVENTS.InteractionPromptChange, interactable),
        this,
      );
      if (level !== this.activeLevel) prompt.setHidden(true);
      this.interactionSystems.set(level, system);
      this.interactionPrompts.set(level, prompt);
    }

    this.cameraController.on(CAMERA_EVENTS.RotateStart, this.handleRotateStart, this);
    this.cameraController.on(CAMERA_EVENTS.RotateComplete, this.handleRotateComplete, this);

    this.input.keyboard?.on("keydown-ESC", this.handleEscape, this);
    this.input.keyboard?.on("keydown-Q", () => this.rotateCameraLeft(), this);
    this.input.keyboard?.on("keydown-R", () => this.rotateCameraRight(), this);

    this.game.events.emit(GAME_EVENTS.StudioReady, this);
  }

  update(): void {
    if (this.cameraController.isRotating()) {
      this.updateDuringRotation();
      return;
    }
    if (this.inputLocked) return;

    const orientation = this.cameraController.getOrientation();
    this.player.update(orientation);
    updateWallOcclusion(
      this.wallSegmentsByOrientation.get(this.layerKey(this.activeLevel, orientation))!,
      this.player.worldX,
      this.player.worldY,
      orientation,
    );
    this.activeInteractionSystem.update(this.player.worldX, this.player.worldY);
    this.activeInteractionPrompt.update();
  }

  /** Called by React when a portfolio panel is closed via its own close button (not ESC). */
  unlockInput(): void {
    this.inputLocked = false;
  }

  /** Called by the mobile [E] button — same trigger the keyboard E key uses internally. */
  interact(): void {
    this.activeInteractionSystem.interact();
  }

  /** Called by the desktop Q key and the mobile ↺ button. No-op while a panel is open or a rotation is already in progress. */
  rotateCameraLeft(): void {
    if (this.inputLocked) return;
    this.cameraController.rotateLeft();
  }

  /** Called by the desktop R key and the mobile ↻ button. No-op while a panel is open or a rotation is already in progress. */
  rotateCameraRight(): void {
    if (this.inputLocked) return;
    this.cameraController.rotateRight();
  }

  /**
   * Builds the four camera orientations' worth of static geometry once, up
   * front. Every Graphics/Text object still lives directly on the scene's
   * own display list (never reparented into a Container — Phaser containers
   * don't depth-sort their children, which would silently break the
   * Y-based layering everything else here relies on); only one
   * orientation's objects are visible at a time outside of a transition.
   */
  private buildOrientationLayers(): void {
    for (const level of LEVELS) {
      for (const orientation of ORIENTATIONS) {
        const objects: LayerObject[] = [];
        const rooms = ROOMS.filter((r) => r.level === level);
        const stairs = STAIRCASES.filter((s) => s.level === level);

        for (const room of rooms) objects.push(createRoomFloor(this, room, orientation));
        for (const stair of stairs) objects.push(createStaircaseVisual(this, stair, orientation));

        const wallSegments = createWalls(this, orientation, level);
        objects.push(...wallSegments.map((segment) => segment.graphics));
        objects.push(createDoorDecorations(this, orientation, level));
        for (const room of rooms) {
          const windowGraphics = createWindows(this, room, orientation);
          if (windowGraphics) objects.push(windowGraphics);
        }
        for (const room of rooms) {
          objects.push(...createFurniture(this, room, orientation));
          objects.push(createRoomLabel(this, room, orientation));
        }

        const visible = level === this.activeLevel && orientation === this.cameraController.getOrientation();
        const tracked = objects.map((obj) => {
          obj.setVisible(visible);
          return { obj, baseX: obj.x, baseY: obj.y, baseDepth: obj.depth };
        });

        const key = this.layerKey(level, orientation);
        this.layerObjects.set(key, tracked);
        this.wallSegmentsByOrientation.set(key, wallSegments);
      }
    }
  }

  /**
   * True continuous rotation, faked cheaply from the existing prebuilt
   * layers: both the outgoing and incoming layer are scaled horizontally
   * (never vertically — this is a yaw around a vertical hinge) around one
   * shared pivot column, outgoing 1→0 while incoming 0→1 at the same rate.
   * That reads as a single flat card turning edge-on and vanishing/unfolding
   * at the hinge, not two flat images sliding past each other under a fade —
   * no alpha is touched at all. The two layers' Y-sorted depths interleave
   * arbitrarily where they overlap, so whichever layer is currently larger
   * (nearer) gets a depth bias to draw cleanly over the smaller one.
   */
  private updateDuringRotation(): void {
    const { from, to, t } = this.cameraController.getTransition();
    const fromScale = 1 - t;
    const toScale = t;
    this.applyLayerFold(this.activeLevel, from, fromScale, fromScale >= toScale);
    this.applyLayerFold(this.activeLevel, to, toScale, toScale > fromScale);
    this.player.blendVisual(from, to, t);
  }

  private applyLayerFold(level: Level, orientation: ViewOrientation, scaleX: number, onTop: boolean): void {
    for (const { obj, baseX, baseY, baseDepth } of this.layerObjects.get(this.layerKey(level, orientation))!) {
      obj.setScale(scaleX, 1);
      obj.setPosition(this.rotationPivotX * (1 - scaleX) + scaleX * baseX, baseY);
      obj.setDepth(onTop ? baseDepth + FOLD_TOP_DEPTH_BIAS : baseDepth);
    }
  }

  private handleRotateStart({ from, to }: RotateStartPayload): void {
    this.inputLocked = true;
    this.rotationPivotX = this.cameras.main.worldView.centerX;
    this.player.stop();
    this.activeInteractionPrompt.setHidden(true);
    this.events.emit(SCENE_EVENTS.CameraRotateStart);

    for (const { obj } of this.layerObjects.get(this.layerKey(this.activeLevel, to))!) obj.setVisible(true);

    const fromSize = projectedSizeFor(from);
    const toSize = projectedSizeFor(to);
    this.cameras.main.setBounds(0, 0, Math.max(fromSize.width, toSize.width), Math.max(fromSize.height, toSize.height));
    // Instant tracking for the short transition: a lerped follow would lag behind the blended visual position and reintroduce the jump/black-gap risk this is meant to avoid.
    this.cameras.main.startFollow(this.player.visual, true, 1, 1);
  }

  private handleRotateComplete(orientation: ViewOrientation): void {
    for (const [key, tracked] of this.layerObjects) {
      const visible = key === this.layerKey(this.activeLevel, orientation);
      for (const { obj, baseX, baseY, baseDepth } of tracked) {
        obj.setVisible(visible);
        obj.setScale(1, 1);
        obj.setPosition(baseX, baseY);
        obj.setDepth(baseDepth);
      }
    }

    const size = projectedSizeFor(orientation);
    this.cameras.main.setBounds(0, 0, size.width, size.height);
    this.cameras.main.startFollow(this.player.visual, true, 0.1, 0.1);
    this.player.reprojectVisual(orientation);

    this.activeInteractionPrompt.setHidden(false);
    this.inputLocked = false;
    this.events.emit(SCENE_EVENTS.CameraRotateEnd);
  }

  private handleInteractionOpen(interactable: Interactable): void {
    this.inputLocked = true;
    this.player.stop();
    this.events.emit(SCENE_EVENTS.InteractionOpen, interactable.panelId);
  }

  private handleEscape(): void {
    if (!this.inputLocked || this.cameraController.isRotating()) return;
    this.inputLocked = false;
    this.events.emit(SCENE_EVENTS.InteractionClose);
  }
}
