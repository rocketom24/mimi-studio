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

/** Strips a "-removebg-preview" export suffix and a trailing " (1)"-style duplicate-file suffix, so both map to the same catalog entry as the plain name. Shared by furnitureEditor.ts (sizing) and furnitureTopdownIcons.ts (icon lookup) so a kind resolves to the same catalog key everywhere. */
export function canonicalKind(kind: string): string {
  return kind
    .replace(/\s*\(\d+\)$/, "")
    .replace(/-removebg-preview$/i, "")
    .toLowerCase();
}

/**
 * Base names that changed outright (not just a suffix strip) when a
 * public/furniture/ PNG was re-exported, keyed by canonicalKind() of the old
 * name. Placed items saved before a rename still carry the old kind, so
 * resolveEditorTextureKey() below maps them to the file that actually exists
 * today. Sizing tables in furnitureEditor.ts intentionally keep keying off
 * the pre-rename names via canonicalKind() directly — only the texture
 * lookup needs today's filename.
 */
const RENAMED_STEMS: Record<string, string> = {
  almirah: "almari",
  "dressing-table": "dressingtable",
  kitchen: "kitchen1",
  "grass-1": "grass1",
  g2: "garden-sofa",
};

/** Resolves a placed item's stored `kind` to the texture key actually preloaded for today's public/furniture/ filenames, so items saved before an asset rename (suffix strip or outright rename, see RENAMED_STEMS) keep rendering instead of showing a black/missing box. */
export function resolveEditorTextureKey(kind: string): string {
  const canonical = canonicalKind(kind);
  return editorTextureKey(RENAMED_STEMS[canonical] ?? canonical);
}

/** Loads every discovered furniture PNG under its own editor texture key. Call once from the scene's preload(). */
export function preloadEditorFurnitureSprites(scene: Phaser.Scene, filenames: readonly string[]): void {
  for (const filename of filenames) {
    scene.load.image(editorTextureKey(fileStem(filename)), `/furniture/${filename}`);
  }
}
