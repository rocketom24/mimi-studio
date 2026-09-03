import { WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";

/**
 * Two fixed camera modes, toggled by Q — never rotated, never blended.
 * Every drawable (floor/walls/doors/windows/furniture/labels/player) is
 * built by calling project(), so switching this mode and rebuilding the
 * level is the only thing a mode toggle needs to do: the underlying house
 * geometry (rooms.ts + wallSystem's grid) never changes.
 */
export type CameraMode = "isometric" | "topdown";

let cameraMode: CameraMode = "isometric";

export function getCameraMode(): CameraMode {
  return cameraMode;
}

export function setCameraMode(mode: CameraMode): void {
  cameraMode = mode;
}

export function toggleCameraMode(): CameraMode {
  cameraMode = cameraMode === "isometric" ? "topdown" : "isometric";
  return cameraMode;
}

/**
 * True dimetric (2:1 "Sims-style") isometric projection: logical (x, y)
 * world-pixel coordinates stay the single source of truth for
 * physics/collision/interactions. This module only maps them to where
 * things are DRAWN, so the apartment reads as an elevated dollhouse view.
 *
 * The camera angle within each mode is fixed (no rotation), so world space
 * and view space are the same thing — every caller can pass world
 * coordinates straight into project() with no intermediate rotation step.
 *
 * - screenX = (worldX - worldY) * ISO_X_SCALE — the classic left/right
 *   diamond edges.
 * - screenY = (worldX + worldY) * ISO_Y_SCALE — the classic top/bottom
 *   diamond edges. ISO_Y_SCALE is half ISO_X_SCALE for the standard 2:1
 *   pixel-art isometric tile ratio.
 * - Z (height off the floor, in px) lifts the projected point straight up
 *   on screen — used to extrude wall/furniture top faces above their
 *   footprint.
 */
export const ISO_X_SCALE = 0.7;
export const ISO_Y_SCALE = ISO_X_SCALE / 2;

/**
 * Top-down mode: a plain orthographic floor-plan projection (screenX =
 * worldX, screenY = worldY, uniformly scaled, no shear). Z is ignored
 * entirely — every z-extruded shape (wall blocks, furniture risers) that
 * draws its top cap/side faces via project(..., z) degenerates to its flat
 * footprint outline for free, with no top-down-specific branch needed in
 * wallSystem/furnitureSystem.
 */
const TOPDOWN_SCALE = 0.84;
const TOPDOWN_PADDING_PX = 16;

/** Screen headroom above row 0 so wall caps / tall furniture never clip against the world/camera top edge. */
export const TOP_PADDING_PX = 32;

/**
 * screenX = (worldX - worldY) * ISO_X_SCALE can go negative (a point at
 * worldX=0 with worldY>0 lands left of the origin) — true isometric shears
 * both ways. This shifts the whole screen-space picture right by the
 * worst-case left-ward excursion (worldX=0, worldY=WORLD_PIXEL_HEIGHT) so
 * every projected point stays at a non-negative screen X.
 */
const LEFT_PADDING_PX = WORLD_PIXEL_HEIGHT * ISO_X_SCALE;

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Projects one world-space point (+ optional height off the floor) to screen space. */
export function project(worldX: number, worldY: number, z = 0): ScreenPoint {
  if (cameraMode === "topdown") {
    return {
      x: worldX * TOPDOWN_SCALE + TOPDOWN_PADDING_PX,
      y: worldY * TOPDOWN_SCALE + TOPDOWN_PADDING_PX,
    };
  }
  return {
    x: (worldX - worldY) * ISO_X_SCALE + LEFT_PADDING_PX,
    y: (worldX + worldY) * ISO_Y_SCALE - z + TOP_PADDING_PX,
  };
}

/**
 * Inverse of project()'s diamond shear, for a screen-space DIRECTION (no z,
 * no translation — just the 2x2 linear part). Under true isometric, moving
 * along a single world axis draws a diagonal on screen, so "screen up" is
 * actually the world-space diagonal (-1,-1) and "screen right" is (1,-1) —
 * solved directly from project()'s screenX/screenY formulas. Keeping input
 * screen-relative (pressing Right always visibly moves right) needs this
 * inverse, re-normalized to the caller's original input magnitude since the
 * diamond's two diagonals don't scale evenly.
 */
export function screenToWorldDelta(screenDx: number, screenDy: number): ScreenPoint {
  if (cameraMode === "topdown") return { x: screenDx, y: screenDy };
  const a = screenDx / ISO_X_SCALE;
  const b = screenDy / ISO_Y_SCALE;
  const worldDx = (a + b) / 2;
  const worldDy = (b - a) / 2;
  const inputMag = Math.hypot(screenDx, screenDy);
  const worldMag = Math.hypot(worldDx, worldDy);
  if (worldMag === 0) return { x: 0, y: 0 };
  const scale = inputMag / worldMag;
  return { x: worldDx * scale, y: worldDy * scale };
}

/**
 * Inverse of project() for a full point (not just a direction): given a
 * screen-space coordinate (e.g. Phaser's pointer.worldX/worldY, which already
 * accounts for camera scroll/zoom), recovers the logical world (x, y) that
 * would project to it at z=0. Used by the furniture editor to turn a pointer
 * position into a storable world coordinate.
 */
export function unproject(screenX: number, screenY: number): ScreenPoint {
  if (cameraMode === "topdown") {
    return {
      x: (screenX - TOPDOWN_PADDING_PX) / TOPDOWN_SCALE,
      y: (screenY - TOPDOWN_PADDING_PX) / TOPDOWN_SCALE,
    };
  }
  const a = (screenX - LEFT_PADDING_PX) / ISO_X_SCALE;
  const b = (screenY - TOP_PADDING_PX) / ISO_Y_SCALE;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Projected screen extent of the whole world, for camera bounds/zoom. */
export function projectedSize(): { width: number; height: number } {
  if (cameraMode === "topdown") {
    return {
      width: Math.ceil(WORLD_PIXEL_WIDTH * TOPDOWN_SCALE + TOPDOWN_PADDING_PX * 2),
      height: Math.ceil(WORLD_PIXEL_HEIGHT * TOPDOWN_SCALE + TOPDOWN_PADDING_PX * 2),
    };
  }
  return {
    width: Math.ceil(LEFT_PADDING_PX + WORLD_PIXEL_WIDTH * ISO_X_SCALE),
    height: Math.ceil((WORLD_PIXEL_WIDTH + WORLD_PIXEL_HEIGHT) * ISO_Y_SCALE + TOP_PADDING_PX),
  };
}
