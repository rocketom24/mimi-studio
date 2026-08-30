import * as Phaser from "phaser";
import { WALL_HEIGHT_PX } from "@/game/config/world";
import { ARCH_PALETTE, lighten } from "@/game/world/palette";
import { visualDepth } from "@/game/world/depth";
import { project } from "@/game/world/projection";
import { computeDoorPlacements, drawBox, WALL_THICKNESS_PX, type BoxFootprint, type DoorPlacement } from "@/game/world/wallSystem";
import { ROOMS } from "@/game/world/rooms";

const DOOR_COLOR = ARCH_PALETTE.door;

// Hysteresis so the leaf doesn't flicker open/closed right at the edge of
// range — opens once Mimi is this close, stays open until she's well past it.
const OPEN_RADIUS_PX = 24;
const CLOSE_RADIUS_PX = 34;
const SWING_DURATION_MS = 320;

export interface DoorSegment {
  placement: DoorPlacement;
  graphics: Phaser.GameObjects.Graphics;
  state: { openness: number };
  isOpen: boolean;
  tween: Phaser.Tweens.Tween | null;
}

/** Fixed midpoint of the doorway opening (independent of swing animation) — used for both proximity checks and depth sorting. */
function doorCenter(p: DoorPlacement): { x: number; y: number } {
  return { x: p.hinge.x + (p.closedDir.x * p.span) / 2, y: p.hinge.y + (p.closedDir.y * p.span) / 2 };
}

/**
 * Redraws one door leaf as a WALL_THICKNESS_PX-thick slab (see drawBox),
 * rotating from flush-in-frame (openness 0, plugging the wall gap like a
 * closed door) to swung fully perpendicular into the declaring room
 * (openness 1). `closedDir` and `openDir` are orthonormal, so lerping the
 * direction itself via cos/sin is a true rotation; `perp` is that same
 * rotation applied a quarter-turn ahead, so the slab's thickness axis turns
 * along with its length axis and stays constant width throughout the swing.
 * `hinge` already sits on the wall band's centerline (see
 * computeDoorPlacements), so at openness 0 the slab lands exactly on top of
 * the wall band it's plugging — same thickness, same position, in both
 * isometric and top-down (every point goes through project(), same as
 * drawBox's wall use).
 */
function drawDoorLeaf(g: Phaser.GameObjects.Graphics, p: DoorPlacement, openness: number): void {
  g.clear();
  const angle = (openness * Math.PI) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dirX = p.closedDir.x * cos + p.openDir.x * sin;
  const dirY = p.closedDir.y * cos + p.openDir.y * sin;
  const perpX = p.openDir.x * cos - p.closedDir.x * sin;
  const perpY = p.openDir.y * cos - p.closedDir.y * sin;

  const half = WALL_THICKNESS_PX / 2;
  const farX = p.hinge.x + dirX * p.span;
  const farY = p.hinge.y + dirY * p.span;

  const footprint: BoxFootprint = [
    { x: p.hinge.x - perpX * half, y: p.hinge.y - perpY * half },
    { x: farX - perpX * half, y: farY - perpY * half },
    { x: farX + perpX * half, y: farY + perpY * half },
    { x: p.hinge.x + perpX * half, y: p.hinge.y + perpY * half },
  ];
  drawBox(g, footprint, DOOR_COLOR);

  // Knob near the free (non-hinge) edge, roughly waist height.
  const knob = project(p.hinge.x + dirX * p.span * 0.85, p.hinge.y + dirY * p.span * 0.85, WALL_HEIGHT_PX * 0.45);
  g.fillStyle(lighten(DOOR_COLOR, 70), 1);
  g.fillCircle(knob.x, knob.y, 1.5);
}

/** Real doors are 2 tiles wide (see rooms.ts doc comment); anything wider is an open archway, not a door. */
const REAL_DOOR_LENGTH_TILES = 2;

/**
 * Builds one animated leaf per declared door — but only the real doors (see
 * rooms.ts doc comment). A wider gap (Living Room's archway into Entrance)
 * is an intentional open connection, not a door, and gets no leaf. Rebuilt
 * alongside the walls on every camera-mode toggle — see
 * StudioScene.buildLevel().
 */
export function createDoors(scene: Phaser.Scene): DoorSegment[] {
  return computeDoorPlacements(ROOMS)
    .filter((placement) => placement.door.length === REAL_DOOR_LENGTH_TILES)
    .map((placement) => {
      const graphics = scene.add.graphics().setDepth(visualDepth(doorCenter(placement).y));
      const segment: DoorSegment = { placement, graphics, state: { openness: 0 }, isOpen: false, tween: null };
      drawDoorLeaf(graphics, placement, 0);
      return segment;
    });
}

/** Swings each door open as Mimi nears it, closed once she's moved away (see OPEN_RADIUS_PX/CLOSE_RADIUS_PX). Purely cosmetic — doors stay collision-open regardless of leaf state, same as before this system existed. */
export function updateDoors(scene: Phaser.Scene, segments: readonly DoorSegment[], playerWorldX: number, playerWorldY: number): void {
  for (const segment of segments) {
    const center = doorCenter(segment.placement);
    const dist = Phaser.Math.Distance.Between(playerWorldX, playerWorldY, center.x, center.y);
    const shouldOpen = dist < (segment.isOpen ? CLOSE_RADIUS_PX : OPEN_RADIUS_PX);
    if (shouldOpen === segment.isOpen) continue;
    segment.isOpen = shouldOpen;
    segment.tween?.stop();
    segment.tween = scene.tweens.add({
      targets: segment.state,
      openness: shouldOpen ? 1 : 0,
      duration: SWING_DURATION_MS,
      ease: "Sine.easeOut",
      onUpdate: () => drawDoorLeaf(segment.graphics, segment.placement, segment.state.openness),
    });
  }
}
