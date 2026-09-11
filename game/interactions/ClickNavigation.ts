import * as Phaser from "phaser";
import type { InputSource, MovementIntent } from "@/game/types/input";
import type { Interactable } from "@/game/types/interaction";
import { project } from "@/game/world/projection";
import type { Point } from "@/game/world/collisionShapes";
import { findPath, type PathGrid } from "@/game/navigation/pathGrid";
import type { FurnitureEditor } from "@/game/world/furnitureEditor";

const IDLE_INTENT: MovementIntent = { up: false, down: false, left: false, right: false };

/** Within this world-px of a waypoint counts as "arrived" — advance to the next one (or stop, if it was the last). */
const ARRIVE_EPS = 4;

/** An interactable's authored point and its nearest real furniture instance must be this close to count as "the same object" — see the brainstorming design note: every real match measured <=16.2px, the one false match (entrance-phone, no furniture of its own) measured 42.4px. */
const MAX_MATCH_DIST_PX = 25;

/** cos(67.5deg): splits a full turn into the same 8 45-degree sectors FACINGS does, so a continuous direction to a waypoint buckets into up/down/left/right combinations exactly the way a held diagonal key-pair would. */
const AXIS_THRESHOLD = 0.3827;

/**
 * Interactable id -> a navigation-only target to walk to instead of the
 * interactable's own (x, y). The bed's footprint runs flush against BOTH the
 * bedroom-study/garden dividing wall and the east exterior wall, leaving no
 * open bedroom-side floor within reach of its authored standing point (the
 * nearest bedroom-side open cell measures ~80px away, computed by scanning
 * the grid — see the click-to-navigate bug investigation); nearestOpenCell's
 * plain nearest-by-distance search resolves onto the garden side instead,
 * which is what sent Mimi the long way round through Entrance/Garden rather
 * than through the Living Room door. This is navigation-only — the E-key
 * proximity prompt still uses the interactable's real (x, y) untouched.
 */
const NAV_TARGET_OVERRIDE: Readonly<Record<string, Point>> = {
  bed: { x: 362, y: 158 },
};

/**
 * Click-to-navigate autopilot. Implements the same InputSource interface
 * Player already takes from the keyboard/touch, so a click just swaps in a
 * different source of up/down/left/right intent — Player's own accel/decel,
 * furniture collision and 8-direction animation apply completely unchanged.
 *
 * update() must run once per frame, before Player.update() reads getIntent().
 */
export class ClickNavigation implements InputSource {
  /** Furniture instance id -> the INTERACTABLE it represents, built once at construction (see the constructor). */
  private readonly itemToInteractable = new Map<string, Interactable>();
  private path: Point[] | null = null;
  private waypointIndex = 0;
  private intent: MovementIntent = IDLE_INTENT;

  constructor(
    private readonly grid: PathGrid,
    furnitureEditor: FurnitureEditor,
    interactables: readonly Interactable[],
  ) {
    for (const interactable of interactables) {
      let bestId: string | undefined;
      let bestDist = Infinity;
      for (const item of furnitureEditor.itemPositions()) {
        const dist = Phaser.Math.Distance.Between(item.x, item.y, interactable.x, interactable.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = item.id;
        }
      }
      if (bestId !== undefined && bestDist <= MAX_MATCH_DIST_PX) this.itemToInteractable.set(bestId, interactable);
    }
  }

  /** True while a click-navigated walk is in progress — StudioScene checks this before letting a real key press stay silent about cancelling it. */
  get isActive(): boolean {
    return this.path !== null;
  }

  /** itemId -> the INTERACTABLE it represents — StudioScene wires a click listener directly onto each matched item's own sprite (see furnitureEditor.itemImage), so only real interactive portfolio furniture is ever clickable. */
  get matchedItems(): ReadonlyMap<string, Interactable> {
    return this.itemToInteractable;
  }

  /** Starts (or redirects, if already walking) a path from the player's current position to this interactable. Called from the matched furniture image's own click handler. */
  navigateTo(interactable: Interactable, playerX: number, playerY: number): void {
    const target = NAV_TARGET_OVERRIDE[interactable.id] ?? interactable;
    const path = findPath(this.grid, playerX, playerY, target.x, target.y);
    if (!path) return;
    this.path = path;
    this.waypointIndex = 0;
  }

  /** Cancels any in-progress walk — called the instant a real movement key goes down. */
  cancel(): void {
    this.path = null;
    this.intent = IDLE_INTENT;
  }

  /** Recomputes this frame's movement intent toward the current waypoint, advancing past any waypoint already reached. */
  update(playerX: number, playerY: number): void {
    if (!this.path) {
      this.intent = IDLE_INTENT;
      return;
    }

    while (this.waypointIndex < this.path.length && Phaser.Math.Distance.Between(playerX, playerY, this.path[this.waypointIndex].x, this.path[this.waypointIndex].y) <= ARRIVE_EPS) {
      this.waypointIndex++;
    }
    if (this.waypointIndex >= this.path.length) {
      this.path = null;
      this.intent = IDLE_INTENT;
      return;
    }

    // Direction is computed in screen space (project() delta — its
    // translation cancels between two points), matching how Player derives
    // facing/velocity from screen-space intent, not world-space.
    const waypoint = this.path[this.waypointIndex];
    const from = project(playerX, playerY);
    const to = project(waypoint.x, waypoint.y);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      this.intent = IDLE_INTENT;
      return;
    }
    const nx = dx / len;
    const ny = dy / len;
    this.intent = {
      right: nx > AXIS_THRESHOLD,
      left: nx < -AXIS_THRESHOLD,
      down: ny > AXIS_THRESHOLD,
      up: ny < -AXIS_THRESHOLD,
    };
  }

  getIntent(): MovementIntent {
    return this.intent;
  }
}
