import { describe, expect, it } from "vitest";
import { computeItemFootprintPolygons, obbToPolygon, pointInPolygon, polygonOverlapsAabb, resolveFurnitureCollision, worldPointToLocal } from "./collisionShapes";

describe("computeItemFootprintPolygons", () => {
  const square = [
    { x: -0.5, y: -0.5 },
    { x: 0.5, y: -0.5 },
    { x: 0.5, y: 0.5 },
    { x: -0.5, y: 0.5 },
  ];

  it("scales and translates at rotation 0", () => {
    const [world] = computeItemFootprintPolygons({ x: 100, y: 200, rotation: 0, scale: 2 }, [square], 10);
    // half-extent 0.5 * baseWidth(10) * scale(2) = 10
    expect(world[0]).toEqual({ x: 90, y: 190 });
    expect(world[2]).toEqual({ x: 110, y: 210 });
  });

  it("rotates 90deg around the item's own anchor", () => {
    const [world] = computeItemFootprintPolygons({ x: 0, y: 0, rotation: 90, scale: 1 }, [[{ x: 1, y: 0 }]], 10);
    // local +X (right) rotated 90deg -> world +Y, within float error
    expect(world[0].x).toBeCloseTo(0);
    expect(world[0].y).toBeCloseTo(10);
  });
});

describe("worldPointToLocal", () => {
  it("inverts computeItemFootprintPolygons for a rotated, scaled, off-origin basis", () => {
    const basis = { x: 40, y: -15, rotation: 37, scale: 1.7 };
    const local = { x: 0.3, y: -0.6 };
    const [[world]] = computeItemFootprintPolygons(basis, [[local]], 10);
    const back = worldPointToLocal(world, basis, 10);
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
  });

  it("matches the old always-unrotated/scale-1 division for a zero-rotation, scale-1 basis", () => {
    const basis = { x: 100, y: 200, rotation: 0, scale: 1 };
    expect(worldPointToLocal({ x: 110, y: 190 }, basis, 10)).toEqual({ x: 1, y: -1 });
  });
});

describe("polygonOverlapsAabb", () => {
  const rect = obbToPolygon(0, 0, 10, 10, 0);

  it("detects a clear overlap", () => {
    expect(polygonOverlapsAabb(rect, 5, 5, 3, 3)).toBe(true);
  });

  it("detects a clear miss", () => {
    expect(polygonOverlapsAabb(rect, 100, 100, 3, 3)).toBe(false);
  });

  it("rejects a box that only overlaps the rotated rect's own AABB, not the true diagonal shape", () => {
    // A long thin rect rotated 45deg runs diagonally through (~14,~14), not
    // through (15,0) — a naive AABB-vs-AABB check would wrongly say overlap
    // (its bounding box does reach x=15), but the true oriented shape doesn't.
    const rotated = obbToPolygon(0, 0, 20, 2, 45);
    expect(polygonOverlapsAabb(rotated, 15, 0, 3, 3)).toBe(false);
  });

  it("detects overlap out at the rotated rect's diagonal tip", () => {
    const rotated = obbToPolygon(0, 0, 20, 2, 45);
    expect(polygonOverlapsAabb(rotated, 13, 14, 3, 3)).toBe(true);
  });
});

describe("resolveFurnitureCollision", () => {
  // Spans [-5,5] on both axes.
  const box = obbToPolygon(0, 0, 5, 5, 0);

  it("pushes a body embedded well inside a polygon fully clear of it, regardless of velocity", () => {
    // Body dead-center inside the box, far deeper than one frame's velocity*dt
    // could ever clear on its own (this is how she'd get wedged in the old
    // code: e.g. a wall's own instant Arcade separation shoving her sideways
    // into furniture placed flush against it).
    const result = resolveFurnitureCollision(0, 0, 2, 2, -50, 0, 1 / 60, [box]);
    expect(polygonOverlapsAabb(box, result.x, result.y, 2, 2)).toBe(false);
  });

  it("old boolean-only check would have left her stuck forever here (regression guard)", () => {
    // Same embedded body: with only the old "does the candidate still
    // overlap" check and no push-out, moving by one frame's worth of
    // velocity from dead-center never escapes the box, so velocity would be
    // zeroed forever. Confirms the reproduction, independent of the fix.
    const dt = 1 / 60;
    const candidateStillOverlaps = polygonOverlapsAabb(box, 0 + -50 * dt, 0, 2, 2);
    expect(candidateStillOverlaps).toBe(true);
  });

  it("still blocks moving further into a polygon it isn't already overlapping", () => {
    // Body sits clear of the box (gap of 3 to its right edge); a fast move
    // left would land the candidate position inside it.
    const result = resolveFurnitureCollision(10, 0, 2, 2, -200, 0, 1 / 60, [box]);
    expect(result.x).toBe(10); // no de-penetration needed, wasn't overlapping
    expect(result.vx).toBe(0); // but the move into the box is blocked
  });

  it("still allows sliding along an edge (Y unaffected while X is blocked)", () => {
    const result = resolveFurnitureCollision(10, 0, 2, 2, -200, 30, 1 / 60, [box]);
    expect(result.vx).toBe(0);
    expect(result.vy).toBe(30);
  });

  it("slides along a DIAGONAL edge instead of stopping dead (the old axis-zeroing stuck here)", () => {
    // A 45deg edge: walking straight at it used to zero both axes, because
    // the X-only probe and the Y-only probe each land inside it, so Mimi
    // glued herself to any angled piece (bed frame, kitchen corner run).
    // Bar running along the (1,-1) anti-diagonal; walk due east into it.
    const diagonal = obbToPolygon(0, 0, 30, 4, -45);
    const result = resolveFurnitureCollision(-5, -5, 2, 2, 60, 0, 1 / 60, [diagonal]);
    const speed = Math.hypot(result.vx, result.vy);
    expect(speed).toBeGreaterThan(20); // still moving - it slid, it didn't stop
    // and what's left runs ALONG the edge (+x-y), not into it
    expect(result.vx + result.vy).toBeCloseTo(0, 3);
    expect(result.vx).toBeGreaterThan(0);
  });

  it("escapes a body embedded across two edge-to-edge polygons (the ping-pong deadlock)", () => {
    // How real footprints are authored: one piece of furniture as adjacent
    // convex columns of differing depth. Resolving them one at a time,
    // escaping the shallow one's nearest edge drops her into the deep one and
    // vice versa, so an even number of passes netted to zero movement — she
    // froze inside the furniture, every frame, forever.
    const shallow = obbToPolygon(-6, 0, 6, 6, 0); // x -12..0, y -6..6
    const deep = obbToPolygon(6, 0, 6, 14, 0); //    x   0..12, y -14..14
    const result = resolveFurnitureCollision(0, 0, 2, 2, 0, 0, 1 / 60, [shallow, deep]);
    expect(polygonOverlapsAabb(shallow, result.x, result.y, 2, 2)).toBe(false);
    expect(polygonOverlapsAabb(deep, result.x, result.y, 2, 2)).toBe(false);
  });

  it("escapes a body dropped deep inside a run of tiled columns", () => {
    // The dining set's real shape: one footprint decomposed into a row of
    // adjacent columns, each far wider than the body. Every column's own
    // cheapest exit is a short hop into the column next door, so a local
    // push-out cycles between interiors forever however the overlap set is
    // grouped — the escape has to widen until it clears the whole run.
    const columns = [-30, -18, -6, 6, 18, 30].map((cx) => obbToPolygon(cx, 0, 6, 20, 0));
    const result = resolveFurnitureCollision(0, 0, 3, 3, 0, 0, 1 / 60, columns);
    for (const column of columns) {
      expect(polygonOverlapsAabb(column, result.x, result.y, 3, 3)).toBe(false);
    }
  });

  it("stops only when there is genuinely nowhere to slide (inside corner)", () => {
    // Two faces meeting at a right angle, Mimi driving into both at once.
    const west = obbToPolygon(-10, 0, 5, 30, 0);
    const north = obbToPolygon(0, -10, 30, 5, 0);
    const result = resolveFurnitureCollision(-2, -2, 2, 2, -80, -80, 1 / 60, [west, north]);
    expect(result.vx).toBe(0);
    expect(result.vy).toBe(0);
  });
});

describe("pointInPolygon", () => {
  const square = obbToPolygon(0, 0, 5, 5, 0);

  it("true for a point inside", () => {
    expect(pointInPolygon({ x: 0, y: 0 }, square)).toBe(true);
  });

  it("false for a point outside", () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(false);
  });
});
