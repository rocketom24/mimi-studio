import type { PortfolioSectionId } from "@/game/data/portfolio";

/** A world object Mimi can walk up to and press E on. */
export interface Interactable {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly prompt: string;
  readonly panelId: PortfolioSectionId;
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
