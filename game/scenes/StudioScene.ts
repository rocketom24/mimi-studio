import * as Phaser from "phaser";
import { WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
import { projectedSize } from "@/game/world/projection";
import { ZOOM_MAX, baselineZoom, minZoomFactor } from "@/game/world/cameraFraming";
import { visualDepth } from "@/game/world/depth";
import { ROOMS } from "@/game/world/rooms";
import { createHouseFloor } from "@/game/world/floorSystem";
import { createWalls, createWindows, type WallSegment } from "@/game/world/wallSystem";
import { createDoors, updateDoors, type DoorSegment } from "@/game/world/doorSystem";
import { createFurniture, preloadFurnitureSprites } from "@/game/world/furnitureSystem";
import { createWorldCollision, staticSolidRects } from "@/game/world/collision";
import { FurnitureEditor, preloadFurnitureEditorData } from "@/game/world/furnitureEditor";
import { FURNITURE_ASSET_FILES_REGISTRY_KEY, preloadEditorFurnitureSprites } from "@/game/world/furnitureEditorAssets";
import { BODY_FOOTPRINT_PX, Player, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, preloadPlayerSprite } from "@/game/entities/Player";
import { KeyboardInput } from "@/game/input/KeyboardInput";
import { TouchInput } from "@/game/input/TouchInput";
import { CombinedInput } from "@/game/input/CombinedInput";
import type { InputSource } from "@/game/types/input";
import { InteractionSystem, INTERACTION_EVENTS } from "@/game/interactions/InteractionSystem";
import { InteractionPrompt } from "@/game/interactions/InteractionPrompt";
import { GreetingBubble } from "@/game/interactions/GreetingBubble";
import { createAmbientLighting, resizeAmbientLighting } from "@/game/world/lighting";
import { ClickNavigation } from "@/game/interactions/ClickNavigation";
import { buildPathGrid } from "@/game/navigation/pathGrid";
import { INTERACTABLES } from "@/game/data/interactables";
import { GAME_EVENTS, SCENE_EVENTS } from "@/game/types/interaction";
import type { Interactable } from "@/game/types/interaction";

// The camera's BASELINE zoom (what zoomFactor=1 draws the house at) is chosen
// per viewport in game/world/cameraFraming.ts — desktop and landscape phones
// fit the whole house, portrait phones frame its height instead so the art is
// never downscaled. ZOOM_MIN/MAX are relative multipliers ON TOP of that
// baseline, not absolute zoom levels, so 1 always means "the default framing
// for this viewport" regardless of window size/aspect. Zooming in (>1) is
// always free since computeCameraBounds clamps bounds back to the house's
// exact extent once the viewport is smaller than it; zooming out is bounded by
// minZoomFactor(), which stops at the whole-house view and no further.
const ZOOM_STEP = 0.1;
// User-initiated zoom (keys/wheel) eases toward its target every frame in
// update() rather than via a Phaser Tween — a rapid wheel/trackpad fires many
// events per second, and restarting a fresh ~200ms Tween on each one (the
// previous approach) kept interrupting itself, which is what read as laggy/
// stuttery zoom. Smoothing the CURRENT zoom toward a TARGET every frame
// decouples the animation from how often wheel events arrive. Closes this
// fraction of the remaining zoomFactor/target gap per frame.
const ZOOM_SMOOTHING = 0.18;
/** Below this gap, snap the last bit instead of asymptotically crawling forever. */
const ZOOM_SNAP_EPSILON = 0.001;
// computeCameraBounds pads bounds out to at least the viewport's size so a
// house smaller than the screen still sits centered — but that means at the
// default fit zoom there's exactly zero scrollable slack (bounds == viewport
// exactly), so a pan would have nowhere to go and Phaser's own bounds clamp
// would snap it straight back. While actively panning, bounds are widened by
// this margin (projected px) on every side instead, purely so there's
// somewhere to drag to; stopPan() restores the normal fitted bounds.
const PAN_BOUNDS_MARGIN = 600;
// There's no Space key to hold on a phone, so a plain one-finger drag pans the
// camera there instead — but a tap has to keep reaching the furniture under
// it. The gesture only becomes a pan once the finger has travelled this far
// (screen px) from where it went down; anything shorter is still a tap.
const TOUCH_PAN_SLOP_PX = 8;
/** Ignore sub-pixel pinch jitter, which would otherwise drift the zoom while two fingers rest still on the screen. */
const PINCH_MIN_DISTANCE_PX = 1;

export class StudioScene extends Phaser.Scene {
  player!: Player;
  /** Written by the mobile D-pad overlay; read by Player alongside KeyboardInput. */
  readonly touchInput = new TouchInput();
  private interactionSystem!: InteractionSystem;
  private interactionPrompt!: InteractionPrompt;
  private greetingBubble!: GreetingBubble;
  private ambientLighting!: Phaser.GameObjects.Graphics;
  private clickNavigation!: ClickNavigation;
  /** Keyboard+touch only, excluding ClickNavigation — checked every frame to know when a real key press should cancel an in-progress click-navigated walk. */
  private manualInput!: InputSource;
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
  /** Where zoomFactor is smoothing toward — see ZOOM_SMOOTHING. Set instantly by adjustZoom; update() eases zoomFactor toward it every frame. */
  private targetZoomFactor = 1;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  /** True while a Space+left-drag camera pan is in progress — see handlePanPointerDown. */
  private panActive = false;
  /** Previous pointer screen position during an active pan, for computing per-move scroll deltas. */
  private panLast: { x: number; y: number } | null = null;
  /** True from the moment a pan starts until the player next actually moves — see update()'s follow-resume check and stopPan's comment for why this isn't cleared by stopPan itself. */
  private followSuspended = false;
  /** Down position of a one-finger touch gesture not yet classified as tap or pan — see TOUCH_PAN_SLOP_PX. Null on desktop, which uses Space+drag instead. */
  private touchPanStart: { x: number; y: number } | null = null;
  /** True while two fingers are down driving a pinch-zoom — suppresses one-finger panning and furniture taps until the second finger lifts. */
  private pinchActive = false;
  /** Screen distance between the two pinch fingers as of the previous pointermove. */
  private pinchLastDistance = 0;

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

    this.furnitureEditor = new FurnitureEditor(this);
    this.furnitureEditor.load();

    const pathGrid = buildPathGrid(staticSolidRects(), this.furnitureEditor.footprintPolygons().map((f) => f.points), BODY_FOOTPRINT_PX / 2);
    this.clickNavigation = new ClickNavigation(pathGrid, this.furnitureEditor, INTERACTABLES);
    // Wire a click listener directly onto each matched furniture image's own
    // sprite (already interactive — see FurnitureEditor.spawn) instead of
    // hit-testing the floor footprint: the footprint is a thin floor-level
    // slice that sits nowhere near where a user actually clicks on tall
    // furniture (a bookshelf, a PC desk, a wardrobe), which read as "clicking
    // does nothing" for exactly those pieces. The sprite's own bounds are
    // what the player actually sees and clicks.
    for (const [itemId, interactable] of this.clickNavigation.matchedItems) {
      const image = this.furnitureEditor.itemImage(itemId);
      image?.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        // Touch is resolved on release instead (below): on a phone the same
        // finger-down also starts a camera drag/pinch, so acting immediately
        // would send Mimi walking every time the viewer panned off a sofa.
        if (pointer.wasTouch) return;
        this.pulseFurnitureClick(image);
        this.handleFurnitureImageClick(interactable);
      });
      image?.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (!pointer.wasTouch || this.panActive || this.pinchActive) return;
        if (pointer.getDistance() > TOUCH_PAN_SLOP_PX) return;
        this.pulseFurnitureClick(image);
        this.handleFurnitureImageClick(interactable);
      });
    }

    this.manualInput = new CombinedInput([new KeyboardInput(this), this.touchInput]);
    this.player = new Player(this, PLAYER_SPAWN_X, PLAYER_SPAWN_Y, new CombinedInput([this.manualInput, this.clickNavigation]));
    this.greetingBubble = new GreetingBubble(this, this.player);

    const collisionGroup = createWorldCollision(this);
    this.physics.add.collider(this.player.sprite, collisionGroup);

    this.applyCameraFraming();
    this.ambientLighting = createAmbientLighting(this);
    // roundPixels off: nothing here is pixel-art (see gameConfig's pixelArt:
    // false), so rounding the camera's scroll to whole pixels every frame was
    // only quantising otherwise-smooth sub-pixel motion into visible 1px
    // steps. No deadzone either — a dead zone reads as the camera lagging
    // then snapping to catch up; a plain per-frame lerp tracks continuously
    // instead, which is what "never jump or lag behind" actually wants.
    this.cameras.main.startFollow(this.player.visual, false, 0.1, 0.1);

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

    this.events.emit(SCENE_EVENTS.ZoomChange, this.zoomFactor);
    this.game.events.emit(GAME_EVENTS.StudioReady, this);
  }

  update(_time: number, delta: number): void {
    this.updateZoomSmoothing();

    const footprints = this.furnitureEditor.footprintPolygons();

    if (this.inputLocked || this.furnitureEditingActive) return;

    // A real key press overrides an in-progress click-navigated walk
    // immediately (see ClickNavigation's doc comment); otherwise let it
    // compute this frame's intent toward the current waypoint.
    const manualIntent = this.manualInput.getIntent();
    if (manualIntent.up || manualIntent.down || manualIntent.left || manualIntent.right) {
      this.clickNavigation.cancel();
    } else {
      this.clickNavigation.update(this.player.worldX, this.player.worldY);
    }

    this.player.update(delta, footprints.map((f) => f.points));
    // Mimi's own render order can't come from her position alone — see
    // FurnitureEditor.bodyRenderDepth. Applied after update(), which is the
    // only thing that sets her default depth (Player.reprojectVisual).
    const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    this.player.visual.setDepth(
      this.furnitureEditor.bodyRenderDepth(
        body.center.x,
        body.center.y,
        body.halfWidth,
        body.halfHeight,
        this.player.visual,
        visualDepth(this.player.worldX, this.player.worldY),
      ),
    );
    // Camera pan is meant to persist (Figma-style) until the viewer actually
    // takes control of Mimi again — see stopPan(). Restoring normal framing
    // only here, gated on real movement intent, is what makes that possible;
    // doing it in stopPan() itself was the bug (snapped back on every
    // pointer-up/Space-up regardless of whether Mimi ever moved).
    if (this.followSuspended && this.player.isMoving) {
      this.followSuspended = false;
      this.applyCameraFraming();
      this.cameras.main.startFollow(this.player.visual, false, 0.1, 0.1);
    }
    this.interactionSystem.update(this.player.worldX, this.player.worldY);
    this.interactionPrompt.update();
    this.greetingBubble.update();
    updateDoors(this, this.doorSegments, this.player.worldX, this.player.worldY);
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

  /**
   * Recomputes camera bounds from the active projection's extent and
   * reapplies zoom (from the CURRENT, already-smoothed zoomFactor — see
   * updateZoomSmoothing), so toggling mode, zooming, or resizing the window
   * never crops the house.
   */
  private applyCameraFraming(): void {
    const bounds = this.computeCameraBounds();
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.cameras.main.setZoom(this.computeFitZoom() * this.zoomFactor);
    // The ambient wash is screen-space but Phaser still scales scrollFactor-0
    // objects by the camera zoom (see lighting.ts), so it has to be redrawn
    // for the new zoom or it stops covering the viewport. Guarded because the
    // first framing pass in create() runs before the overlay exists.
    if (this.ambientLighting) {
      resizeAmbientLighting(this.ambientLighting, this.scale.width, this.scale.height, this.cameras.main.zoom);
    }
  }

  /** Eases zoomFactor toward targetZoomFactor every frame — see ZOOM_SMOOTHING's doc comment for why this replaced a per-wheel-event Tween. */
  private updateZoomSmoothing(): void {
    const gap = this.targetZoomFactor - this.zoomFactor;
    if (gap === 0) return;
    this.zoomFactor = Math.abs(gap) < ZOOM_SNAP_EPSILON ? this.targetZoomFactor : Phaser.Math.Linear(this.zoomFactor, this.targetZoomFactor, ZOOM_SMOOTHING);
    this.applyCameraFraming();
    this.events.emit(SCENE_EVENTS.ZoomChange, this.zoomFactor);
  }

  /** Called by Phaser's ScaleManager whenever the canvas is resized (window resize, container resize) — the game size is no longer a fixed constant, so every viewport-dependent calc has to redo itself here instead of once at create(). */
  private handleGameResize(): void {
    // The zoom floor is viewport-dependent (see minZoomFactor), so a rotation
    // from portrait to landscape can leave an existing zoomed-out factor below
    // the new floor — re-clamp before reframing rather than letting the camera
    // sit outside its own range until the next pinch.
    const minFactor = this.minZoomFactor();
    this.zoomFactor = Phaser.Math.Clamp(this.zoomFactor, minFactor, ZOOM_MAX);
    this.targetZoomFactor = Phaser.Math.Clamp(this.targetZoomFactor, minFactor, ZOOM_MAX);
    // applyCameraFraming redraws the ambient overlay for the new viewport/zoom.
    this.applyCameraFraming();
    this.events.emit(SCENE_EVENTS.ZoomChange, this.zoomFactor);
  }

  /** Baseline zoom for the current viewport — see game/world/cameraFraming.ts. Recomputed every call instead of cached since the viewport size changes continuously with the window. */
  private computeFitZoom(): number {
    return baselineZoom(this.scale.width, this.scale.height);
  }

  /** How far out zoomFactor may go on this viewport — 1 normally, lower on a portrait phone so a pinch can still reach the whole-house overview. */
  private minZoomFactor(): number {
    return minZoomFactor(this.scale.width, this.scale.height);
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

  /** Only moves the target — update()'s updateZoomSmoothing() eases the actual camera toward it every frame, so rapid-fire wheel/key events (trackpad scroll can send dozens a second) never restart or fight an in-flight animation. */
  private adjustZoom(delta: number): void {
    this.targetZoomFactor = Phaser.Math.Clamp(this.targetZoomFactor + delta, this.minZoomFactor(), ZOOM_MAX);
    (window as unknown as { __CAM_DEBUG__?: unknown }).__CAM_DEBUG__ = {
      zoomFactor: this.zoomFactor,
      targetZoomFactor: this.targetZoomFactor,
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
    if (pointer.wasTouch) {
      this.handleTouchPointerDown(pointer);
      return;
    }
    if (!this.spaceKey.isDown || !pointer.leftButtonDown() || !this.isPointerFromCanvas(pointer)) return;
    this.beginPan(pointer);
  }

  private handlePanPointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) {
      this.handleTouchPointerMove(pointer);
      return;
    }
    this.applyPanDelta(pointer);
  }

  private handlePanPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.panActive) this.stopPan();
    if (!pointer.wasTouch) return;
    this.touchPanStart = null;
    // Only drop out of pinch mode once the second finger is actually gone —
    // otherwise lifting one of two fingers would immediately hand the
    // remaining one a fresh pan mid-gesture.
    if (this.activeTouchPointers().length < 2) {
      this.pinchActive = false;
      this.pinchLastDistance = 0;
    }
  }

  /** Every touch pointer currently held down. Phaser's InputManager owns the pointer pool (see gameConfig's input.activePointers); the scene's InputPlugin only exposes the active one. */
  private activeTouchPointers(): Phaser.Input.Pointer[] {
    return this.input.manager.pointers.filter((pointer) => pointer.isDown && pointer.wasTouch);
  }

  /**
   * Touch has no modifier key to arm panning with, so classification is
   * positional: a second finger means pinch-zoom, and a single finger stays
   * ambiguous (tap or pan) until it passes TOUCH_PAN_SLOP_PX in
   * handleTouchPointerMove. Nothing is committed here.
   */
  private handleTouchPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.inputLocked || this.furnitureEditingActive || !this.isPointerFromCanvas(pointer)) return;
    const touches = this.activeTouchPointers();
    if (touches.length >= 2) {
      this.beginPinch(touches[0], touches[1]);
      return;
    }
    this.touchPanStart = { x: pointer.x, y: pointer.y };
  }

  private handleTouchPointerMove(pointer: Phaser.Input.Pointer): void {
    const touches = this.activeTouchPointers();
    if (touches.length >= 2) {
      if (!this.pinchActive) this.beginPinch(touches[0], touches[1]);
      this.updatePinch(touches[0], touches[1]);
      return;
    }
    // A finger left over from a finished pinch must not start panning — it
    // never had a down position recorded for it, and the user is still just
    // letting go of a zoom gesture.
    if (this.pinchActive || !this.touchPanStart) return;
    if (!this.panActive) {
      if (Phaser.Math.Distance.Between(pointer.x, pointer.y, this.touchPanStart.x, this.touchPanStart.y) < TOUCH_PAN_SLOP_PX) return;
      this.beginPan(pointer);
    }
    this.applyPanDelta(pointer);
  }

  /** Shared by Space+drag (desktop) and a one-finger touch drag — see PAN_BOUNDS_MARGIN for why bounds are widened. */
  private beginPan(pointer: Phaser.Input.Pointer): void {
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

  private applyPanDelta(pointer: Phaser.Input.Pointer): void {
    if (!this.panActive || !this.panLast) return;
    const zoom = this.cameras.main.zoom;
    this.cameras.main.scrollX -= (pointer.x - this.panLast.x) / zoom;
    this.cameras.main.scrollY -= (pointer.y - this.panLast.y) / zoom;
    this.panLast = { x: pointer.x, y: pointer.y };
  }

  private beginPinch(first: Phaser.Input.Pointer, second: Phaser.Input.Pointer): void {
    this.pinchActive = true;
    this.pinchLastDistance = Phaser.Math.Distance.Between(first.x, first.y, second.x, second.y);
    this.touchPanStart = null;
    if (this.panActive) this.stopPan();
  }

  /**
   * Zoom follows the ratio the fingers' separation changed by, so the world
   * tracks the pinch 1:1 instead of stepping — and it's applied straight to
   * zoomFactor rather than to targetZoomFactor alone, because a pinch is a
   * continuous direct manipulation: routing it through ZOOM_SMOOTHING (which
   * exists to absorb discrete wheel/key bursts) would just make it feel like
   * the screen was lagging behind the fingers.
   */
  private updatePinch(first: Phaser.Input.Pointer, second: Phaser.Input.Pointer): void {
    const distance = Phaser.Math.Distance.Between(first.x, first.y, second.x, second.y);
    if (distance < PINCH_MIN_DISTANCE_PX || this.pinchLastDistance < PINCH_MIN_DISTANCE_PX) {
      this.pinchLastDistance = distance;
      return;
    }
    const next = Phaser.Math.Clamp(this.zoomFactor * (distance / this.pinchLastDistance), this.minZoomFactor(), ZOOM_MAX);
    this.pinchLastDistance = distance;
    if (next === this.zoomFactor) return;
    this.zoomFactor = next;
    this.targetZoomFactor = next;
    this.applyCameraFraming();
    this.events.emit(SCENE_EVENTS.ZoomChange, this.zoomFactor);
  }

  /**
   * A matched furniture image's own click (see the per-image listeners set
   * up in create()) starts Mimi walking there — see ClickNavigation. Shares
   * the same lock/editor guards handlePanPointerDown uses; Space being down
   * means this click is really starting a pan, not a furniture click.
   */
  private handleFurnitureImageClick(interactable: Interactable): void {
    if (this.spaceKey.isDown || this.inputLocked || this.furnitureEditingActive) return;
    this.clickNavigation.navigateTo(interactable, this.player.worldX, this.player.worldY);
  }

  /** Tiny scale-up-and-back pulse so clicking a piece of furniture reads as registered, even before Mimi starts walking to it. Purely cosmetic — never touches the click/navigation logic above. */
  private pulseFurnitureClick(image: Phaser.GameObjects.Image): void {
    if (this.spaceKey.isDown || this.inputLocked || this.furnitureEditingActive) return;
    const scaleX = image.scaleX;
    const scaleY = image.scaleY;
    this.tweens.add({
      targets: image,
      scaleX: scaleX * 1.06,
      scaleY: scaleY * 1.06,
      duration: 90,
      yoyo: true,
      ease: "Quad.easeOut",
    });
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
