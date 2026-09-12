import { projectedSize } from "@/game/world/projection";

/**
 * How the camera's baseline zoom is chosen for a given viewport.
 *
 * Pure arithmetic, split out of StudioScene so the framing rules can be
 * checked directly (see cameraFraming.test.ts) rather than only by eye.
 * "Zoom" here is the absolute camera zoom the house is drawn at; the user's
 * own zoomFactor multiplies on top of whatever `baselineZoom` returns.
 */

/** Desktop breathing room: the whole house fills this fraction of the viewport. */
export const FILL_FACTOR = 0.8;

/**
 * On a phone the whole-house fit is pinned by the SHORT axis (a 390px-wide
 * portrait screen against a wide isometric house), so the usual 20% breathing
 * room costs a fifth of an already tiny screen. Phone-sized viewports keep
 * only a hairline of padding instead.
 */
export const COMPACT_FILL_FACTOR = 0.98;

/**
 * ...but on a PORTRAIT phone even a hairline of padding is the wrong framing
 * entirely. The house projects to 504x284, so fitting all 504 of its width
 * into a 390px-wide screen means drawing it at 0.76x — the art is DOWNSCALED,
 * which is exactly what reads as blurry, and the 284-tall house then occupies
 * barely a quarter of an 844px-tall screen.
 *
 * Portrait therefore frames the house's HEIGHT and lets its width run off the
 * sides; the follow-cam keeps Mimi centred, so you walk to see the rest.
 *
 * This fraction is how much of the screen height the house fills. It's the one
 * taste knob in this module: raise it to get closer, lower it to see more of
 * the house at once. The floor that matters is 1x camera zoom — below that the
 * art is being downscaled again, which is the blur this framing exists to fix
 * (0.6 keeps a 390x844 phone at ~1.78x). Capped per-viewport by the control
 * band below — the remainder of the screen is slack the logo and the D-pad sit
 * in rather than on top of the house.
 */
export const COMPACT_HEIGHT_FILL_FACTOR = 0.6;

/**
 * The D-pad's own measurements, mirroring components/game/TouchControls.tsx —
 * 3 rows of buttons, two `gap-1` gaps, and the `bottom-*` offset it's pinned
 * at. Its buttons grow past 400px wide and shrink on short viewports, so the
 * band it occupies is viewport-dependent; change the sizes there and these
 * have to follow.
 */
const DPAD_BUTTON_PX = 48; // h-12
const DPAD_BUTTON_WIDE_PX = 56; // min-[400px]:h-14
const DPAD_BUTTON_SHORT_PX = 44; // [@media(max-height:520px)]:h-11
const DPAD_GAP_PX = 4; // gap-1
const DPAD_BOTTOM_OFFSET_PX = 16; // bottom-4
const DPAD_BOTTOM_OFFSET_SHORT_PX = 8; // [@media(max-height:520px)]:bottom-2
/** Breathing room between the house's bottom edge and the top of the D-pad. */
const CONTROLS_CLEARANCE_PX = 8;

/**
 * Screen px at the bottom edge the house must stay out of.
 *
 * The house is centred vertically (computeCameraBounds pads the bounds out
 * symmetrically whenever the viewport is taller than the house), so keeping it
 * clear of this band costs the reserve at BOTH ends — which is why a fixed
 * fill fraction alone isn't enough: 0.6 fits a 390x844 phone exactly but ran
 * 35px under the D-pad on a 375x667 and 9px under it on a 412x915, where the
 * buttons are a size larger.
 */
export function compactControlsReservePx(width: number, height: number): number {
  const short = height <= COMPACT_MAX_HEIGHT;
  const button = short ? DPAD_BUTTON_SHORT_PX : width >= 400 ? DPAD_BUTTON_WIDE_PX : DPAD_BUTTON_PX;
  const offset = short ? DPAD_BOTTOM_OFFSET_SHORT_PX : DPAD_BOTTOM_OFFSET_PX;
  return offset + button * 3 + DPAD_GAP_PX * 2 + CONTROLS_CLEARANCE_PX;
}

// Phone-sized in either orientation — mirrors useIsTouchDevice's COMPACT_QUERY
// so the camera and the HUD switch treatment together.
export const COMPACT_MAX_WIDTH = 640;
export const COMPACT_MAX_HEIGHT = 520;

/** Floor for the user zoom multiplier where the baseline already shows the whole house. */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2.5;

export function isCompactViewport(width: number, height: number): boolean {
  return width <= COMPACT_MAX_WIDTH || height <= COMPACT_MAX_HEIGHT;
}

/**
 * Zoom at which the house's whole projected extent fits inside the fill factor
 * of the viewport. Still the baseline everywhere except a portrait phone, and
 * always the framing a pinch-out can reach — see `minZoomFactor`.
 */
export function fitHouseZoom(width: number, height: number): number {
  const size = projectedSize();
  const fill = isCompactViewport(width, height) ? COMPACT_FILL_FACTOR : FILL_FACTOR;
  return Math.min(width / size.width, height / size.height) * fill;
}

/**
 * The baseline the user's zoomFactor multiplies against.
 *
 * On a phone this takes whichever framing shows the house LARGER: the
 * whole-house fit, or the height-filling one. Landscape phones keep the
 * whole-house fit — their aspect already matches the house's, so it wins the
 * max on its own — while portrait gets the much closer framing. Desktop is
 * untouched.
 */
export function baselineZoom(width: number, height: number): number {
  const houseZoom = fitHouseZoom(width, height);
  if (!isCompactViewport(width, height)) return houseZoom;
  return Math.max(houseZoom, (height / projectedSize().height) * compactHeightFill(width, height));
}

/**
 * The height fill actually used: the taste knob clamped to whatever still
 * clears the controls on this particular screen. Short phones get less than
 * the knob asks for — that's the honest limit of a centred house sharing the
 * screen with a fixed-size D-pad, not a tuning miss.
 */
export function compactHeightFill(width: number, height: number): number {
  const clearOfControls = Math.max(0, height - 2 * compactControlsReservePx(width, height)) / height;
  return Math.min(COMPACT_HEIGHT_FILL_FACTOR, clearOfControls);
}

/**
 * Lower bound for the user's zoomFactor. Normally 1 — the baseline already
 * frames the whole house, so zooming out past it would only reveal empty
 * padded world. Where the baseline is closer than that (portrait phone), this
 * drops below 1 by exactly the ratio needed to let a pinch-out still reach the
 * whole-house overview, and no further.
 */
export function minZoomFactor(width: number, height: number): number {
  return Math.min(ZOOM_MIN, fitHouseZoom(width, height) / baselineZoom(width, height));
}
