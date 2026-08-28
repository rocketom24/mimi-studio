import * as Phaser from "phaser";

/**
 * Single source of text styling for the whole game world.
 *
 * `pixelArt: true` forces NEAREST filtering on every texture, including the
 * canvas Phaser bakes for each Text object. Nearest-filtering the soft,
 * anti-aliased edges of a tiny font is what reads as "blurry" after FIT
 * scales the 320x180 buffer up to the real viewport. Fix: render each Text
 * texture at a higher internal resolution (more source pixels to sample)
 * and switch that one texture to LINEAR filtering so it downscales smoothly
 * instead of being nearest-sampled like the pixel-art tiles.
 */
const TEXT_RESOLUTION = 4;
const FONT_FAMILY = "monospace";

export const ROOM_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: "8px",
  fontStyle: "bold",
  color: "#f5f0ff",
  resolution: TEXT_RESOLUTION,
  shadow: { offsetX: 0, offsetY: 1, color: "#000000", blur: 0, fill: true },
};

export const PROMPT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: "9px",
  fontStyle: "bold",
  color: "#ffe9a8",
  backgroundColor: "#1a1423e6",
  padding: { x: 3, y: 2 },
  resolution: TEXT_RESOLUTION,
};

export const DIALOGUE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: "9px",
  color: "#f0ead6",
  backgroundColor: "#1a1423e6",
  padding: { x: 6, y: 4 },
  resolution: TEXT_RESOLUTION,
  wordWrap: { width: 180 },
};

/** Create a Text object using one of the styles above, with crisp (non-nearest) scaling applied. */
export function createGameText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, content, style);
  text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return text;
}
