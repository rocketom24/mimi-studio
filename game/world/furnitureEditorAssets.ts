import type * as Phaser from "phaser";

/**
 * Texture handling for the dev-only furniture editor's auto-discovered PNGs
 * (see game/world/furnitureEditor.ts). Deliberately separate from
 * furnitureSystem.ts's SPRITE_PATH/spriteTextureKey — those stay closed over
 * the fixed FurnitureKind union for production rendering; the editor instead
 * takes whatever filenames app/page.tsx found in public/furniture/ at
 * render time, so adding a new PNG never requires touching either module.
 */

/** Phaser registry key GameCanvas sets (before the scene's preload phase) and StudioScene.preload() reads, carrying the server-discovered public/furniture/ filenames across the React/Phaser boundary. */
export const FURNITURE_ASSET_FILES_REGISTRY_KEY = "furnitureAssetFiles";

/** Strips a file extension, e.g. "catBed.png" -> "catBed". Used as the editor's item-kind identifier. */
export function fileStem(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? filename : filename.slice(0, dot);
}

export function editorTextureKey(stem: string): string {
  return `furniture-editor-${stem}`;
}

/** Loads every discovered furniture PNG under its own editor texture key. Call once from the scene's preload(). */
export function preloadEditorFurnitureSprites(scene: Phaser.Scene, filenames: readonly string[]): void {
  for (const filename of filenames) {
    scene.load.image(editorTextureKey(fileStem(filename)), `/furniture/${filename}`);
  }
}
