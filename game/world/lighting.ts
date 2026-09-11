import * as Phaser from "phaser";

/**
 * Above every world object, HUD-level label, and the interaction
 * prompt/greeting bubble (see world/depth.ts's DEPTH.PROMPT) — a screen-space
 * overlay has to sit above literally everything it's meant to tint.
 */
const LIGHTING_DEPTH = 9000;

const WARM_TOP = 0xffe6bf;
const COOL_BOTTOM = 0x3a2f4d; // PALETTE.plum

/**
 * Draws (or redraws, on resize/zoom) the ambient light wash into an existing
 * Graphics object, sized to cover exactly the given viewport at the given
 * camera zoom.
 *
 * `setScrollFactor(0)` frees the overlay from camera SCROLL but not from
 * camera ZOOM — Phaser still scales it about the camera's centre. A plain
 * width x height rect therefore only covers the whole screen when zoom is
 * >= 1: at the fitted zoom on a phone (~0.76) it covered ~76% of the screen
 * and read as a lighter rectangular patch with hard edges, which vanished as
 * soon as you zoomed in past 1. Desktop never showed it because its fitted
 * zoom is > 1 and the rect over-covered instead. Pre-dividing by the zoom and
 * centring makes the drawn rect land exactly on the viewport edges at any
 * zoom, so the gradient's top/bottom stay where the design intends.
 */
function drawAmbientLighting(g: Phaser.GameObjects.Graphics, width: number, height: number, zoom: number): void {
  g.clear();
  const coverWidth = width / zoom;
  const coverHeight = height / zoom;
  // Soft warm light pooling in from above, cooling very slightly toward the
  // floor — a cheap, shader-free "room lighting" read: one 4-corner gradient
  // rect. Alpha stays low enough to tint without washing out any furniture or
  // floor color beneath it.
  g.fillGradientStyle(WARM_TOP, WARM_TOP, COOL_BOTTOM, COOL_BOTTOM, 0.1, 0.1, 0.05, 0.05);
  g.fillRect((width - coverWidth) / 2, (height - coverHeight) / 2, coverWidth, coverHeight);
}

/**
 * Creates the ambient lighting overlay: fixed to the camera (scrollFactor 0)
 * so it always covers the current viewport regardless of camera pan/zoom.
 * Purely a screen-space tint — never touches world objects, depth-sorting,
 * collision, or input. Call resizeAmbientLighting whenever the viewport OR the
 * camera zoom changes, so it keeps covering the full screen.
 */
export function createAmbientLighting(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(LIGHTING_DEPTH).setScrollFactor(0);
  drawAmbientLighting(g, scene.scale.width, scene.scale.height, scene.cameras.main.zoom);
  return g;
}

export function resizeAmbientLighting(g: Phaser.GameObjects.Graphics, width: number, height: number, zoom: number): void {
  drawAmbientLighting(g, width, height, zoom);
}
