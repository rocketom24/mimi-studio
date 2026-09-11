import * as Phaser from "phaser";

/**
 * Above every world object, HUD-level label, and the interaction
 * prompt/greeting bubble (see world/depth.ts's DEPTH.PROMPT) — a screen-space
 * overlay has to sit above literally everything it's meant to tint.
 */
const LIGHTING_DEPTH = 9000;

const WARM_TOP = 0xffe6bf;
const COOL_BOTTOM = 0x3a2f4d; // PALETTE.plum

/** Draws (or redraws, on resize) the ambient light wash into an existing Graphics object, sized to the given viewport. */
function drawAmbientLighting(g: Phaser.GameObjects.Graphics, width: number, height: number): void {
  g.clear();
  // Soft warm light pooling in from above, cooling very slightly toward the
  // floor — a cheap, shader-free "room lighting" read: one 4-corner gradient
  // rect. Alpha stays low enough to tint without washing out any furniture or
  // floor color beneath it.
  g.fillGradientStyle(WARM_TOP, WARM_TOP, COOL_BOTTOM, COOL_BOTTOM, 0.1, 0.1, 0.05, 0.05);
  g.fillRect(0, 0, width, height);
}

/**
 * Creates the ambient lighting overlay: fixed to the camera (scrollFactor 0)
 * so it always covers the current viewport regardless of camera pan/zoom.
 * Purely a screen-space tint — never touches world objects, depth-sorting,
 * collision, or input. Call resizeAmbientLighting on viewport resize to keep
 * it covering the full screen.
 */
export function createAmbientLighting(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(LIGHTING_DEPTH).setScrollFactor(0);
  drawAmbientLighting(g, scene.scale.width, scene.scale.height);
  return g;
}

export function resizeAmbientLighting(g: Phaser.GameObjects.Graphics, width: number, height: number): void {
  drawAmbientLighting(g, width, height);
}
