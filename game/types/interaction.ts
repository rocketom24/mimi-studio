import type { PortfolioSectionId } from "@/game/data/portfolio";
import type { Level } from "@/game/types/world";

/** A world object Mimi can walk up to and press E on. */
export interface Interactable {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly prompt: string;
  readonly panelId: PortfolioSectionId;
  /**
   * The floor this interactable lives on. Carried explicitly rather than
   * derived from (x, y) via `roomAt` — both floors deliberately reuse the
   * same 0-512x0-288 coordinate space, and several rooms genuinely overlap
   * across levels there (e.g. the ground floor's single large Living Room
   * footprint fully overlaps the upstairs Bedroom+Study footprints), so a
   * point can be geometrically "inside" a room on more than one level at
   * once. Only the room this interactable was actually authored against
   * (see `roomPoint` in game/data/interactables.ts) knows the true level.
   */
  readonly level: Level;
}

/** Emitted on Phaser.Game.events once StudioScene has finished create(). */
export const GAME_EVENTS = {
  StudioReady: "studio-ready",
} as const;

/** Emitted on StudioScene.events — the Phaser -> React interaction bridge. */
export const SCENE_EVENTS = {
  InteractionOpen: "interactionOpen",
  InteractionClose: "interactionClose",
  InteractionPromptChange: "interactionPromptChange",
  CameraRotateStart: "cameraRotateStart",
  CameraRotateEnd: "cameraRotateEnd",
} as const;
