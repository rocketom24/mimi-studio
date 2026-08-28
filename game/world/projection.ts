import { WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
import type { PixelRect } from "@/game/types/world";

/**
 * Cavalier-oblique 2.5D projection: logical (x, y) world-pixel coordinates
 * stay the single source of truth for physics/collision/interactions. This
 * module only maps them to where things are DRAWN, so the apartment reads
 * as an elevated, angled dollhouse view instead of flat top-down.
 *
 * - X shears rightward proportional to depth (Y): rows further "south"
 *   (larger Y, closer to the viewer) shift right, turning each room's
 *   rectangle into a slanted parallelogram instead of a diamond.
 * - Y compresses (foreshortens) so depth doesn't just read as height.
 * - Z (height off the floor, in px) lifts the projected point straight up
 *   on screen — used to extrude wall/furniture top faces above their
 *   footprint.
 */
export const SHEAR_X = 0.3;
export const DEPTH_SCALE_Y = 0.65;

/** Screen headroom above row 0 so wall caps / tall furniture never clip against the world/camera top edge. */
export const TOP_PADDING_PX = 32;

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Projects one already-view-space point (+ optional height off the floor) to screen space. */
export function project(viewX: number, viewY: number, z = 0): ScreenPoint {
  return {
    x: viewX + viewY * SHEAR_X,
    y: viewY * DEPTH_SCALE_Y - z + TOP_PADDING_PX,
  };
}

/**
 * Four fixed dollhouse-camera orientations (Phase 11). The apartment itself
 * never moves — this only picks which side of it faces the camera. 0 is the
 * Phase 10B default; rotating right steps 0→1→2→3→0, left steps the reverse.
 */
export type ViewOrientation = 0 | 1 | 2 | 3;
export const ORIENTATIONS: readonly ViewOrientation[] = [0, 1, 2, 3];

/**
 * Rotates one world point into view space: for VIEW 0 this is the identity
 * (matches every Phase 10B call site untouched), and for the other three it
 * swaps/mirrors axes so that in view space +Y is *always* "toward the
 * camera" and +X is *always* the shear direction — the exact convention
 * project() already assumes. That single invariant is what lets every other
 * system (walls, furniture, floors, occlusion, depth) reuse its Phase 10B
 * math unchanged: they just get fed view-space coordinates first.
 */
export function toViewSpace(worldX: number, worldY: number, orientation: ViewOrientation): ScreenPoint {
  switch (orientation) {
    case 0:
      return { x: worldX, y: worldY };
    case 1:
      return { x: WORLD_PIXEL_HEIGHT - worldY, y: worldX };
    case 2:
      return { x: WORLD_PIXEL_WIDTH - worldX, y: WORLD_PIXEL_HEIGHT - worldY };
    case 3:
      return { x: worldY, y: WORLD_PIXEL_WIDTH - worldX };
  }
}

/**
 * Inverse of toViewSpace()'s rotation, for a movement DIRECTION rather than a
 * point (no center/translation involved — direction vectors only rotate).
 * Lets input stay screen-relative at every orientation: "screen up" always
 * maps to whatever world-space direction currently renders as up, instead of
 * always meaning world -Y. Exact algebraic inverse of toViewSpace, so it
 * needs no per-orientation gameplay special-casing to match the renderer.
 */
export function viewToWorldDelta(viewDx: number, viewDy: number, orientation: ViewOrientation): ScreenPoint {
  switch (orientation) {
    case 0:
      return { x: viewDx, y: viewDy };
    case 1:
      return { x: viewDy, y: -viewDx };
    case 2:
      return { x: -viewDx, y: -viewDy };
    case 3:
      return { x: -viewDy, y: viewDx };
  }
}

/** toViewSpace() + project() in one call, for a single world point. */
export function projectOriented(worldX: number, worldY: number, orientation: ViewOrientation, z = 0): ScreenPoint {
  const view = toViewSpace(worldX, worldY, orientation);
  return project(view.x, view.y, z);
}

/**
 * Rotates a world-space rect into view space. 90°-multiple rotations of an
 * axis-aligned rect are always exactly axis-aligned in the result, so the
 * bounding box of the four rotated corners is exact, not an approximation.
 * Works for anything rect-shaped: walls, floors, furniture footprints,
 * windows, doors.
 */
export function toViewRect(rect: PixelRect, orientation: ViewOrientation): PixelRect {
  const corners = [
    toViewSpace(rect.x, rect.y, orientation),
    toViewSpace(rect.x + rect.w, rect.y, orientation),
    toViewSpace(rect.x, rect.y + rect.h, orientation),
    toViewSpace(rect.x + rect.w, rect.y + rect.h, orientation),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Projected screen extent for a given orientation — 90/270 swap the world's width/height before shearing. */
export function projectedSizeFor(orientation: ViewOrientation): { width: number; height: number } {
  const swapped = orientation === 1 || orientation === 3;
  const viewW = swapped ? WORLD_PIXEL_HEIGHT : WORLD_PIXEL_WIDTH;
  const viewH = swapped ? WORLD_PIXEL_WIDTH : WORLD_PIXEL_HEIGHT;
  return {
    width: Math.ceil(viewW + viewH * SHEAR_X),
    height: Math.ceil(viewH * DEPTH_SCALE_Y + TOP_PADDING_PX),
  };
}
