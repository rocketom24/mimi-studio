// Matches StudioScene's ZOOM_MIN/ZOOM_MAX (1..2.5): HUD layers recede over
// this range so they stop sitting on top of furniture once the player has
// zoomed in close to look at it.
export const FADE_START = 1.5;
export const FADE_END = 2.2;

/**
 * 1 while fitted, easing to `floor` by FADE_END.
 *
 * `floor` is the whole point of the parameter: informational panels
 * (StudioHud's guide, the first-visit toast) may fade to nothing, but the
 * D-pad and Interact button are how a phone player moves at all — they only
 * ever recede to a still-readable, still-tappable ghost, never disappear.
 */
export function hudFadeOpacity(zoomFactor: number, floor = 0): number {
  const t = Math.min(1, Math.max(0, (zoomFactor - FADE_START) / (FADE_END - FADE_START)));
  return 1 - t * (1 - floor);
}
