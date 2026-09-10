/**
 * Manually-authored furniture collision footprints: no PNG-bounds/alpha/AABB
 * guessing anywhere in this module. A kind's shape is whatever polygons were
 * drawn for it in the furniture editor's Collision mode (see
 * furnitureEditor.ts) — this module only transforms and tests those points.
 *
 * Pure math, no Phaser import — also used server-side by the collision-shapes
 * save API route to validate the payload (same reasoning as
 * furnitureEditorAssets.ts's isFurnitureEditorItem).
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * One furniture kind's authored footprint: a list of convex polygons, points
 * stored as fractions of the kind's baseDisplayWidth, in its own unrotated
 * local frame (local +X/+Y match world floor X/Y at rotation 0, scale 1) —
 * same fraction convention furnitureEditor.ts's old MEASURED_FOOTPRINTS table
 * used, so a placed instance's world footprint is just
 * point * baseDisplayWidth(kind) * item.scale, rotated by item.rotation,
 * translated by item.x/y (see computeItemFootprintPolygons).
 *
 * Concave shapes are NOT supported by polygonOverlapsAabb's SAT test below —
 * author a concave piece (an L-shaped counter, say) as multiple convex
 * polygons instead of one; that's what multi-polygon support is for.
 */
export type CollisionShapeMap = Record<string, Point[][]>;

/** One kind's or instance's authored shape list (see CollisionShapeMap) — factored out of isCollisionShapeMap so the per-instance collision-shapes API route can validate a single shape list without a whole map wrapped around it. */
export function isShapeList(value: unknown): value is Point[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (points) =>
        Array.isArray(points) &&
        points.every((p) => typeof p === "object" && p !== null && typeof (p as Point).x === "number" && typeof (p as Point).y === "number"),
    )
  );
}

export function isCollisionShapeMap(value: unknown): value is CollisionShapeMap {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>).every(isShapeList);
}

/** The subset of a placed item's fields this module needs to transform its footprint — kept structural so this module doesn't depend on furnitureEditor.ts's PlacedItem type. */
export interface FootprintItem {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

/** One world-space collision polygon plus whether it came from a hand-drawn shape or the legacy auto-guessed fallback — used only by the debug overlay (see StudioScene.ts) to color-code the two. */
export interface FootprintPolygon {
  points: Point[];
  authored: boolean;
}

/**
 * Transforms one kind's authored local (fraction-of-baseWidth) polygons into
 * world floor-space polygons for one placed instance: scale each point by
 * baseWidth*item.scale, rotate by item.rotation, translate by item.x/y. Every
 * instance of the kind shares the same authored shape and gets its own
 * transform — draw once, every move/rotate/resize applies exactly.
 */
export function computeItemFootprintPolygons(item: FootprintItem, localPolygons: readonly Point[][], baseWidth: number): Point[][] {
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const scale = baseWidth * item.scale;
  return localPolygons.map((points) =>
    points.map((p) => {
      const lx = p.x * scale;
      const ly = p.y * scale;
      return { x: item.x + lx * cos - ly * sin, y: item.y + lx * sin + ly * cos };
    }),
  );
}

/**
 * Inverse of computeItemFootprintPolygons's per-point transform: given a
 * world floor-space point and the same (x, y, rotation, scale) basis plus
 * baseWidth, returns the local fraction-of-baseWidth point that transforms
 * forward to it. The old collision editor only ever drew on an unrotated,
 * scale-1 preview, so it could get away with dividing by baseWidth directly;
 * editing a real placed instance in-place means the basis can carry any
 * rotation/scale, so drawing/dragging math needs the real inverse.
 */
export function worldPointToLocal(world: Point, basis: FootprintItem, baseWidth: number): Point {
  const rad = (basis.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const scale = baseWidth * basis.scale;
  const dx = world.x - basis.x;
  const dy = world.y - basis.y;
  return {
    x: (dx * cos + dy * sin) / scale,
    y: (-dx * sin + dy * cos) / scale,
  };
}

/** 4 world-space corners of an oriented rectangle (center + half-extents + angle) — lets the legacy auto-computed footprint (furnitureEditor.ts's computeFootprintObb, kept as a fallback for kinds with no authored shape yet) flow through the same polygonOverlapsAabb test as a hand-drawn shape. */
export function obbToPolygon(cx: number, cy: number, halfW: number, halfH: number, angleDeg: number): Point[] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const local: Point[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];
  return local.map((p) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }));
}

/**
 * True if the convex polygon overlaps the axis-aligned rectangle centered at
 * (aabbCx, aabbCy) with the given half-extents. SAT over every candidate
 * separating axis: each polygon edge's own normal, plus the AABB's 2 axes
 * (world X/Y) — the same test the old rectangle-only obbOverlapsAabb used,
 * generalized from a fixed 4 corners to any convex N-gon. Assumes the polygon
 * is convex (not checked here) — see the CollisionShapeMap doc comment.
 */
export function polygonOverlapsAabb(polygon: readonly Point[], aabbCx: number, aabbCy: number, aabbHalfW: number, aabbHalfH: number): boolean {
  if (polygon.length < 2) return false;
  const axes: Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const len = Math.hypot(edgeX, edgeY);
    if (len === 0) continue;
    axes.push({ x: -edgeY / len, y: edgeX / len });
  }

  for (const axis of axes) {
    let polyMin = Infinity;
    let polyMax = -Infinity;
    for (const p of polygon) {
      const proj = p.x * axis.x + p.y * axis.y;
      if (proj < polyMin) polyMin = proj;
      if (proj > polyMax) polyMax = proj;
    }
    const aabbCenterProj = aabbCx * axis.x + aabbCy * axis.y;
    const aabbRadius = Math.abs(axis.x) * aabbHalfW + Math.abs(axis.y) * aabbHalfH;
    if (polyMax < aabbCenterProj - aabbRadius || aabbCenterProj + aabbRadius < polyMin) return false;
  }
  return true;
}

/**
 * Signed minimum-translation vector to push an AABB fully outside one convex
 * polygon it overlaps (or {x:0,y:0} if it doesn't, or is only touching at the
 * boundary). Same axis set as polygonOverlapsAabb. Per axis, the correct
 * separation distance is min(polyMax-aabbMin, aabbMax-polyMin) — NOT the
 * naive interval-intersection length (min(polyMax,aabbMax)-max(polyMin,aabbMin)),
 * which under-measures whenever the AABB is nested well inside the polygon's
 * projection (a plain corner clip is fine, but a deeply-embedded body — e.g.
 * shoved into furniture by a wall's own instant separation — needs the full
 * distance to either edge, not just its own projected width). The axis with
 * the smallest such distance is the push direction (standard MTV heuristic:
 * escape via the nearest edge).
 */
// Tiny extra clearance added to every push-out so the body lands strictly
// outside the polygon rather than exactly touching it — without this,
// polygonOverlapsAabb's boundary-inclusive test would still report "overlap"
// at the landing spot (it only rejects on a strictly-separating axis), so the
// very next frame would try to push out all over again from a depth of ~0.
const PUSH_SKIN = 0.01;

function polygonPushOutOfAabb(polygon: readonly Point[], aabbCx: number, aabbCy: number, aabbHalfW: number, aabbHalfH: number): Point {
  if (polygon.length < 2) return { x: 0, y: 0 };
  const axes: Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const len = Math.hypot(edgeX, edgeY);
    if (len === 0) continue;
    axes.push({ x: -edgeY / len, y: edgeX / len });
  }

  let bestDepth = Infinity;
  let bestAxis: Point | null = null;
  let bestSign = 1;

  for (const axis of axes) {
    let polyMin = Infinity;
    let polyMax = -Infinity;
    for (const p of polygon) {
      const proj = p.x * axis.x + p.y * axis.y;
      if (proj < polyMin) polyMin = proj;
      if (proj > polyMax) polyMax = proj;
    }
    const aabbCenterProj = aabbCx * axis.x + aabbCy * axis.y;
    const aabbRadius = Math.abs(axis.x) * aabbHalfW + Math.abs(axis.y) * aabbHalfH;
    const aabbMin = aabbCenterProj - aabbRadius;
    const aabbMax = aabbCenterProj + aabbRadius;
    if (polyMax < aabbMin || aabbMax < polyMin) return { x: 0, y: 0 }; // a separating axis exists - no overlap at all

    const depthPos = polyMax - aabbMin; // push the AABB in +axis until its min clears the polygon's max
    const depthNeg = aabbMax - polyMin; // push it in -axis until its max clears the polygon's min
    const depth = Math.min(depthPos, depthNeg);
    if (depth < bestDepth) {
      bestDepth = depth;
      bestAxis = axis;
      bestSign = depthPos <= depthNeg ? 1 : -1;
    }
  }

  if (!bestAxis || bestDepth < 1e-6) return { x: 0, y: 0 };
  const push = bestDepth + PUSH_SKIN;
  return { x: bestAxis.x * push * bestSign, y: bestAxis.y * push * bestSign };
}

/**
 * Resolves Mimi's body against every furniture polygon for one physics step.
 *
 * First de-penetrates: pushes the body fully clear of any polygon it's
 * already overlapping (a few passes, since escaping one piece can land
 * inside a neighbor placed edge-to-edge with it) so she can never stay
 * wedged no matter how she got embedded — a wall's own instant Arcade
 * separation shoving her sideways into furniture flush against it, a spawn
 * overlap, anything. This runs unconditionally, independent of her current
 * velocity, which is what makes it an actual escape instead of just another
 * "don't move into it" check.
 *
 * Then, from that corrected position, zeroes whichever velocity axis would
 * carry her INTO a polygon this step — axis-separated so sliding along a
 * piece's edge still works (blocking X alone doesn't block a simultaneous Y
 * move, and vice versa).
 */
export function resolveFurnitureCollision(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  vx: number,
  vy: number,
  dt: number,
  polygons: readonly Point[][],
): { x: number; y: number; vx: number; vy: number } {
  let x = cx;
  let y = cy;

  if (polygons.length > 0) {
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const polygon of polygons) {
        const push = polygonPushOutOfAabb(polygon, x, y, halfW, halfH);
        if (push.x !== 0 || push.y !== 0) {
          x += push.x;
          y += push.y;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  if (dt <= 0 || polygons.length === 0) return { x, y, vx, vy };

  let resolvedVx = vx;
  if (vx !== 0 && polygons.some((polygon) => polygonOverlapsAabb(polygon, x + vx * dt, y, halfW, halfH))) {
    resolvedVx = 0;
  }

  let resolvedVy = vy;
  if (vy !== 0 && polygons.some((polygon) => polygonOverlapsAabb(polygon, x + resolvedVx * dt, y + vy * dt, halfW, halfH))) {
    resolvedVy = 0;
  }

  return { x, y, vx: resolvedVx, vy: resolvedVy };
}

/** True if `point` falls inside `polygon` (standard ray-casting test) — used by the collision editor to tell "click on empty space, start a new shape" apart from "click inside an existing shape, drag the whole thing". */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
