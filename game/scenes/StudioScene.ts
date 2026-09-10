import * as Phaser from "phaser";
import { WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
import { project, projectedSize } from "@/game/world/projection";
import type { FootprintPolygon } from "@/game/world/collisionShapes";
import { ROOMS } from "@/game/world/rooms";
import { createHouseFloor } from "@/game/world/floorSystem";
import { createWalls, createWindows, type WallSegment } from "@/game/world/wallSystem";
import { createDoors, updateDoors, type DoorSegment } from "@/game/world/doorSystem";
import { createFurniture, preloadFurnitureSprites } from "@/game/world/furnitureSystem";
import { createWorldCollision } from "@/game/world/collision";
import { FurnitureEditor, preloadFurnitureEditorData } from "@/game/world/furnitureEditor";
import { FURNITURE_ASSET_FILES_REGISTRY_KEY, preloadEditorFurnitureSprites } from "@/game/world/furnitureEditorAssets";
import { Player, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, preloadPlayerSprite } from "@/game/entities/Player";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import { TouchInput } from "@/game/input/TouchInput";
import { CombinedInput } from "@/game/input/CombinedInput";
import { InteractionSystem, INTERACTION_EVENTS } from "@/game/interactions/InteractionSystem";
import { InteractionPrompt } from "@/game/interactions/InteractionPrompt";
import { INTERACTABLES } from "@/game/data/interactables";
import { GAME_EVENTS, SCENE_EVENTS } from "@/game/types/interaction";
import type { Interactable } from "@/game/types/interaction";

// applyCameraFraming's fit-zoom already sizes the house to fill FILL_FACTOR
// of whatever viewport it's given (see computeFitZoom), so ZOOM_MIN/MAX are
// relative multipliers ON TOP of that fit, not absolute zoom levels — 1
// always means "fitted", regardless of window size/aspect. ZOOM_MIN is
// pinned to 1 (the fit itself) so the user can never zoom out past the
// FILL_FACTOR framing into empty padded world space; zooming in (>1) is
// still free since computeCameraBounds clamps bounds back to the house's
// exact extent once the viewport is smaller than it.
const FILL_FACTOR = 0.8;
const ZOOM_MIN = 1;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;
// computeCameraBounds pads bounds out to at least the viewport's size so a
// house smaller than the screen still sits centered — but that means at the
// default fit zoom there's exactly zero scrollable slack (bounds == viewport
// exactly), so a pan would have nowhere to go and Phaser's own bounds clamp
// would snap it straight back. While actively panning, bounds are widened by
// this margin (projected px) on every side instead, purely so there's
// somewhere to drag to; stopPan() restores the normal fitted bounds.
const PAN_BOUNDS_MARGIN = 600;

export class StudioScene extends Phaser.Scene {
  player!: Player;
  /** Written by the mobile D-pad overlay; read by Player alongside KeyboardInput. */
  readonly touchInput = new TouchInput();
  private interactionSystem!: InteractionSystem;
  private interactionPrompt!: InteractionPrompt;
  /** Furniture placement overlay — see game/world/furnitureEditor.ts. Always spawns its saved/default layout; editing itself stays dev-only (gated in GameCanvas.tsx). Its items' footprints are resolved against Mimi every frame in update() (see Player.ts/collisionShapes.ts), not baked into createWorldCollision(). */
  furnitureEditor!: FurnitureEditor;
  private inputLocked = false;
  /** Set by GameCanvas while the (dev-only) Furniture Editor is open — see setFurnitureEditingActive. Separate from inputLocked (portfolio panels) so neither system can accidentally clear a lock it doesn't own. */
  private furnitureEditingActive = false;
  private wallSegments: WallSegment[] = [];
  private doorSegments: DoorSegment[] = [];
  /** Every static level Graphics/Text object built by buildLevel(). */
  private levelObjects: Phaser.GameObjects.GameObject[] = [];
  private zoomFactor = 1;
  /** "Show Collision" debug overlay — draws every currently-resolved furniture collision polygon over the scene, color-coded hand-drawn vs legacy-fallback (see collisionShapes.ts). Works during normal play, not just Furniture Editor mode, so collision can be checked without also being in edit mode. */
  private collisionDebugGraphics: Phaser.GameObjects.Graphics | null = null;
  private collisionDebugVisible = false;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  /** True while a Space+left-drag camera pan is in progress — see handlePanPointerDown. */
  private panActive = false;
  /** Previous pointer screen position during an active pan, for computing per-move scroll deltas. */
  private panLast: { x: number; y: number } | null = null;
  /** True from the moment a pan starts until the player next actually moves — see update()'s follow-resume check and stopPan's comment for why this isn't cleared by stopPan itself. */
  private followSuspended = false;

  constructor() {
    super("StudioScene");
  }

  preload(): void {
    preloadPlayerSprite(this);
    preloadFurnitureSprites(this);
    const furnitureAssetFiles = this.registry.get(FURNITURE_ASSET_FILES_REGISTRY_KEY) as string[] | undefined;
    preloadEditorFurnitureSprites(this, furnitureAssetFiles ?? []);
    preloadFurnitureEditorData(this);
  }

  create(): void {
    this.buildLevel();
    (window as unknown as { __scene?: Phaser.Scene }).__scene = this;

    this.physics.world.setBounds(0, 0, WORLD_PIXEL_WIDTH, WORLD_PIXEL_HEIGHT);

    const input = new CombinedInput([new KeyboardInput(this), this.touchInput]);
    this.player = new Player(this, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, input);

    this.furnitureEditor = new FurnitureEditor(this);
    this.furnitureEditor.load();

    const collisionGroup = createWorldCollision(this);
    this.physics.add.collider(this.player.sprite, collisionGroup);

    this.applyCameraFraming();
    this.cameras.main.startFollow(this.player.visual, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(48, 28);

    this.input.keyboard?.on("keydown", this.handleZoomKey, this);
    this.input.on("wheel", this.handleWheelZoom, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleGameResize, this);

    // Figma-style hand-drag panning: hold Space (cursor becomes a hand),
    // left-drag to slide the camera around, release either to resume normal
    // control. Works everywhere, not just the Furniture Editor, so reaching
    // a far corner of the house never requires walking Mimi there first.
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard?.on("keydown-SPACE", this.handleSpaceDown, this);
    this.input.keyboard?.on("keyup-SPACE", this.handleSpaceUp, this);
    this.input.on("pointerdown", this.handlePanPointerDown, this);
    this.input.on("pointermove", this.handlePanPointerMove, this);
    this.input.on("pointerup", this.handlePanPointerUp, this);

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

  update(_time: number, delta: number): void {
    // Collision debug draw runs even while the Furniture Editor is open (and
    // input is otherwise frozen below) — it's a pure readout of whatever's
    // currently authored, not something that moves the camera/player, so
    // there's no reason "Show Collision" should go blank the moment you're
    // actually drawing a shape.
    const footprints = this.furnitureEditor.footprintPolygons();
    if (this.collisionDebugVisible) this.drawCollisionDebug(footprints);

    if (this.inputLocked || this.furnitureEditingActive) return;

    this.player.update(delta, footprints.map((f) => f.points));
    // Camera pan is meant to persist (Figma-style) until the viewer actually
    // takes control of Mimi again — see stopPan(). Restoring normal framing
    // only here, gated on real movement intent, is what makes that possible;
    // doing it in stopPan() itself was the bug (snapped back on every
    // pointer-up/Space-up regardless of whether Mimi ever moved).
    if (this.followSuspended && this.player.isMoving) {
      this.followSuspended = false;
      this.applyCameraFraming();
      this.cameras.main.startFollow(this.player.visual, true, 0.1, 0.1);
    }
    this.interactionSystem.update(this.player.worldX, this.player.worldY);
    this.interactionPrompt.update();
    updateDoors(this, this.doorSegments, this.player.worldX, this.player.worldY);
  }

  /** Toggled by GameCanvas's "Show Collision" button. */
  setCollisionDebugVisible(visible: boolean): void {
    this.collisionDebugVisible = visible;
    if (!visible) this.collisionDebugGraphics?.clear();
  }

  /** Draws every resolved collision polygon over the scene: cyan for a hand-drawn shape, amber for a kind still on the legacy auto-guessed fallback (see collisionShapes.ts) — a quick visual check for "have I drawn this piece yet" and "does Mimi's walkway actually look right". */
  private drawCollisionDebug(footprints: readonly FootprintPolygon[]): void {
    if (!this.collisionDebugGraphics) this.collisionDebugGraphics = this.add.graphics().setDepth(5000);
    const g = this.collisionDebugGraphics;
    g.clear();
    for (const { points, authored } of footprints) {
      if (points.length < 2) continue;
      const color = authored ? 0x4dd9ff : 0xffb84d;
      g.lineStyle(2, color, 0.9);
      g.fillStyle(color, 0.25);
      const screenPoints = points.map((p) => project(p.x, p.y));
      g.beginPath();
      g.moveTo(screenPoints[0].x, screenPoints[0].y);
      for (let i = 1; i < screenPoints.length; i++) g.lineTo(screenPoints[i].x, screenPoints[i].y);
      g.closePath();
      g.fillPath();
      g.strokePath();
    }
  }

  /** Called by React when a portfolio panel is closed via its own close button (not ESC). */
  unlockInput(): void {
    this.inputLocked = false;
  }

  /**
   * Called by GameCanvas whenever the (dev-only) Furniture Editor opens/closes.
   * Without this, Mimi (and the camera, which follows her) keeps moving every
   * frame while the editor is open — collision shapes are drawn in fixed
   * screen/world space, so any drift silently shifts what a click lands on
   * mid-edit. Mirrors handleInteractionOpen's inputLocked + player.stop() so
   * the room is fully still for the whole editing session, exactly like it
   * already is for a portfolio panel.
   */
  setFurnitureEditingActive(active: boolean): void {
    this.furnitureEditingActive = active;
    if (active) this.player.stop();
  }

  /** Called by the mobile [E] button — same trigger the keyboard E key uses internally. */
  interact(): void {
    if (this.inputLocked) return;
    this.interactionSystem.interact();
  }

  /** Builds the house's static geometry, once up front. */
  private buildLevel(): void {
    for (const segment of this.doorSegments) segment.tween?.stop();
    for (const obj of this.levelObjects) obj.destroy();
    this.levelObjects = [];

    this.levelObjects.push(...createHouseFloor(this));

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
    }
  }

  /** Recomputes camera bounds from the active projection's extent and reapplies zoom, so toggling mode, zooming, or resizing the window never crops the house. */
  private applyCameraFraming(): void {
    const bounds = this.computeCameraBounds();
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.cameras.main.setZoom(this.computeFitZoom() * this.zoomFactor);
  }

  /** Called by Phaser's ScaleManager whenever the canvas is resized (window resize, container resize) — the game size is no longer a fixed constant, so every viewport-dependent calc has to redo itself here instead of once at create(). */
  private handleGameResize(): void {
    this.applyCameraFraming();
  }

  /** Zoom level at which the house's whole projected extent fits inside FILL_FACTOR of the current viewport — the baseline user zoom (zoomFactor=1) multiplies against. Recomputed every call instead of cached since the viewport size changes continuously with the window. */
  private computeFitZoom(): number {
    const size = projectedSize();
    return Math.min(this.scale.width / size.width, this.scale.height / size.height) * FILL_FACTOR;
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
    const zoom = this.computeFitZoom() * this.zoomFactor;
    const viewWidth = this.scale.width / zoom;
    const viewHeight = this.scale.height / zoom;
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
    this.applyCameraFraming();
    (window as unknown as { __CAM_DEBUG__?: unknown }).__CAM_DEBUG__ = {
      zoomFactor: this.zoomFactor,
      cameraZoom: this.cameras.main.zoom,
      scrollX: this.cameras.main.scrollX,
      scrollY: this.cameras.main.scrollY,
      worldView: { ...this.cameras.main.worldView },
    };
  }

  /** True unless the pointer's real DOM event target is something other than the game canvas — see FurnitureEditor's isPointerFromCanvas for why this matters: Phaser also forwards mousedown/mouseup from anywhere on the page (e.g. a sidebar button), which must never be able to arm/drive a pan. */
  private isPointerFromCanvas(pointer: Phaser.Input.Pointer): boolean {
    const target = pointer.event?.target;
    return !target || target === this.game.canvas;
  }

  /**
   * event.preventDefault() here matters for two real reasons, not just
   * hygiene: (1) if a sidebar button (e.g. "Draw Collision") still has
   * keyboard focus from an earlier click, the browser's own default action
   * for Space on a focused button is to activate it on keyup — without
   * this, pressing Space to start panning also silently re-clicks whatever
   * button you last touched. (2) suspends the Furniture Editor's input the
   * instant Space goes down, not when a drag is later detected — the editor
   * registers its own pointerdown listener before this scene's pan listener
   * (it's constructed earlier in create()), so if suspension waited for
   * handlePanPointerDown instead, the very click that starts a pan would
   * still reach the editor first and place/select something.
   */
  private handleSpaceDown(event: KeyboardEvent): void {
    event.preventDefault();
    if (!this.panActive) this.input.setDefaultCursor("grab");
    this.furnitureEditor.setInputSuspended(true);
  }

  private handleSpaceUp(event: KeyboardEvent): void {
    event.preventDefault();
    if (this.panActive) this.stopPan();
    this.furnitureEditor.setInputSuspended(false);
    this.input.setDefaultCursor("");
  }

  private handlePanPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.spaceKey.isDown || !pointer.leftButtonDown() || !this.isPointerFromCanvas(pointer)) return;
    this.panActive = true;
    this.panLast = { x: pointer.x, y: pointer.y };
    this.followSuspended = true;
    this.cameras.main.stopFollow();
    this.input.setDefaultCursor("grabbing");
    // See PAN_BOUNDS_MARGIN: without this, dragging at the default fit zoom
    // does nothing at all — the bounds are already exactly viewport-sized.
    const size = projectedSize();
    this.cameras.main.setBounds(-PAN_BOUNDS_MARGIN, -PAN_BOUNDS_MARGIN, size.width + PAN_BOUNDS_MARGIN * 2, size.height + PAN_BOUNDS_MARGIN * 2);
  }

  private handlePanPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.panActive || !this.panLast) return;
    const zoom = this.cameras.main.zoom;
    this.cameras.main.scrollX -= (pointer.x - this.panLast.x) / zoom;
    this.cameras.main.scrollY -= (pointer.y - this.panLast.y) / zoom;
    this.panLast = { x: pointer.x, y: pointer.y };
  }

  private handlePanPointerUp(): void {
    if (this.panActive) this.stopPan();
  }

  /**
   * Ends an in-progress pan (pointer released, or Space let go — see
   * handleSpaceUp). Deliberately leaves the camera exactly where the drag
   * left it — bounds stay widened (PAN_BOUNDS_MARGIN) and follow stays off
   * — so the panned view persists like Figma's hand tool instead of
   * snapping back the instant you let go. update()'s followSuspended check
   * is what restores normal framing and follow, once the viewer actually
   * moves Mimi again. Does NOT re-enable the Furniture Editor here: that's
   * governed purely by Space's own up/down state (handleSpaceDown/Up), so
   * releasing just the mouse button while still holding Space (to
   * immediately start a new pan elsewhere) stays in "hand mode" the whole
   * time, exactly like Figma.
   */
  private stopPan(): void {
    this.panActive = false;
    this.panLast = null;
    this.input.setDefaultCursor(this.spaceKey.isDown ? "grab" : "");
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
