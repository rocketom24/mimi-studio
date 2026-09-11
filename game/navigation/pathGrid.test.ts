import { describe, expect, it } from "vitest";
import { buildPathGrid, findPath } from "./pathGrid";
import type { PixelRect } from "../types/world";

const WALL: PixelRect = { x: 40, y: 0, w: 8, h: 60 }; // vertical wall with a gap below y=60

describe("buildPathGrid + findPath", () => {
  it("routes around a wall instead of a straight line through it", () => {
    const grid = buildPathGrid([WALL], [], 5);
    const path = findPath(grid, 20, 20, 60, 20);
    expect(path).not.toBeNull();

    // every step of the path (including the leg from the start) must clear the wall's rect
    const points = [{ x: 20, y: 20 }, ...(path ?? [])];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const steps = 20;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const insideWall = x > WALL.x - 5 && x < WALL.x + WALL.w + 5 && y > WALL.y - 5 && y < WALL.y + WALL.h + 5;
        expect(insideWall).toBe(false);
      }
    }
  });

  it("reaches the exact requested destination point", () => {
    const grid = buildPathGrid([], [], 5);
    const path = findPath(grid, 10, 10, 100, 50);
    expect(path).not.toBeNull();
    expect(path?.[path.length - 1]).toEqual({ x: 100, y: 50 });
  });

  it("returns an empty-ish path (just the target) when already there", () => {
    const grid = buildPathGrid([], [], 5);
    const path = findPath(grid, 10, 10, 10, 10);
    expect(path).toEqual([{ x: 10, y: 10 }]);
  });

  it("marks a furniture-polygon cell blocked", () => {
    const square = [
      { x: 100, y: 100 },
      { x: 116, y: 100 },
      { x: 116, y: 116 },
      { x: 100, y: 116 },
    ];
    const grid = buildPathGrid([], [square], 5);
    const cx = Math.floor(108 / 8);
    const cy = Math.floor(108 / 8);
    expect(grid.blocked[cy * grid.cols + cx]).toBe(1);
  });
});
