import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The studio's mark is one frame of the walk sheet the player is currently
 * controlling — the same crop StudioHud's logo and the About panel's avatar
 * show, expressed here in the sheet's own native pixels so the icon routes can
 * re-derive it at any output size.
 *
 * Numbers check out against components/game/MimiAvatar.tsx: that component
 * scales the 1344x768 sheet to 403.2x230.4 for a 36px box (scale 0.3) and
 * shifts it -15.6px, i.e. a 120px frame starting 52px in.
 */
export const MIMI_MARK = {
  sheetWidth: 1344,
  sheetHeight: 768,
  frameX: 52,
  frameY: 0,
  frameSize: 120,
} as const;

/** Warm lamplight ground, matching the panel tokens in app/globals.css. */
export const BRAND = {
  ink: "#211a12",
  inkDeep: "#14100b",
  gold: "#ffd98e",
  cream: "#f4ecdd",
  muted: "#b9a88f",
} as const;

/**
 * The sprite sheet inlined as a data URI. Satori (behind ImageResponse) has no
 * access to the running server's static files when these routes are generated
 * at build time, so the bytes have to travel with the markup.
 */
export function mimiSheetDataUri(): string {
  const file = readFileSync(
    join(process.cwd(), "public", "assets", "game", "character", "mimi-sheet-1.png"),
  );
  return `data:image/png;base64,${file.toString("base64")}`;
}

/** Style props that paint the Mimi frame, cropped, filling a `size`-px box. */
export function mimiMarkStyle(size: number) {
  const scale = size / MIMI_MARK.frameSize;
  return {
    backgroundImage: `url(${mimiSheetDataUri()})`,
    backgroundSize: `${MIMI_MARK.sheetWidth * scale}px ${MIMI_MARK.sheetHeight * scale}px`,
    backgroundPosition: `${-MIMI_MARK.frameX * scale}px ${-MIMI_MARK.frameY * scale}px`,
  };
}
