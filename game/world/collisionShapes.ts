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

// Tiny extra clearance added to every push-out so the body lands strictly
// outside the polygon rather than exactly touching it — without this,
// polygonOverlapsAabb's boundary-inclusive test would still report "overlap"
// at the landing spot (it only rejects on a strictly-separating axis), so the
// very next frame would try to push out all over again from a depth of ~0.
const PUSH_SKIN = 0.01;

/**
 * Single minimum translation that pushes an AABB clear of EVERY polygon in
 * `polygons` it currently overlaps at once ({x:0,y:0} if it overlaps none).
 *
 * Deliberately set-wise, not one polygon at a time. Furniture footprints are
 * authored as several convex pieces sharing edges (an L-shaped counter, a
 * desk decomposed into columns of differing depth), so a body shoved into
 * one usually overlaps two or three adjacent pieces. Resolving them
 * sequentially deadlocks: escaping piece A along A's own nearest edge drops
 * the body into neighbour B, whose nearest edge points straight back into A.
 * With an even number of passes that nets to exactly zero movement every
 * frame — Mimi frozen solid inside the furniture, which is precisely how she
 * got stuck. Solving the whole overlap set against one axis can't ping-pong:
 * the chosen move clears all of them together.
 *
 * Per candidate axis (world X/Y plus every overlapping polygon's edge
 * normals), a single displacement t clears polygon p if t >= depthPos(p) or
 * t <= -depthNeg(p); one scalar can't satisfy some of each, so the axis costs
 * min(max depthPos, max depthNeg) over the whole set. Cheapest axis wins —
 * the usual MTV heuristic of escaping via the nearest edge, generalised from
 * one shape to the set.
 *
 * Per polygon the separation distance is depthPos/depthNeg measured to the
 * polygon's far edge, NOT the naive interval-intersection length
 * (min(polyMax,aabbMax) - max(polyMin,aabbMin)), which under-measures
 * whenever the AABB sits well inside the polygon's projection: a corner clip
 * is fine either way, but a deeply-embedded body needs the full distance out.
 */
function overlappingPolygons(
  polygons: readonly (readonly Point[])[],
  aabbCx: number,
  aabbCy: number,
  aabbHalfW: number,
  aabbHalfH: number,
): (readonly Point[])[] {
  const hits: (readonly Point[])[] = [];
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    if (polygonOverlapsAabb(polygon, aabbCx, aabbCy, aabbHalfW, aabbHalfH)) hits.push(polygon);
  }
  return hits;
}

function setPushOut(hits: readonly (readonly Point[])[], aabbCx: number, aabbCy: number, aabbHalfW: number, aabbHalfH: number): Point {
  if (hits.length === 0) return { x: 0, y: 0 };

  const axes: Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  for (const polygon of hits) {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const edgeX = b.x - a.x;
      const edgeY = b.y - a.y;
      const len = Math.hypot(edgeX, edgeY);
      if (len === 0) continue;
      axes.push({ x: -edgeY / len, y: edgeX / len });
    }
  }

  let bestDepth = Infinity;
  let bestAxis: Point | null = null;
  let bestSign = 1;

  for (const axis of axes) {
    const aabbCenterProj = aabbCx * axis.x + aabbCy * axis.y;
    const aabbRadius = Math.abs(axis.x) * aabbHalfW + Math.abs(axis.y) * aabbHalfH;
    const aabbMin = aabbCenterProj - aabbRadius;
    const aabbMax = aabbCenterProj + aabbRadius;

    // -Infinity, not 0: a member the body is already clear of on this axis
    // reports a negative depth, and that must stay negative so it doesn't
    // inflate the cost of an axis the rest of the cluster can be escaped by.
    let maxDepthPos = -Infinity;
    let maxDepthNeg = -Infinity;
    for (const polygon of hits) {
      let polyMin = Infinity;
      let polyMax = -Infinity;
      for (const p of polygon) {
        const proj = p.x * axis.x + p.y * axis.y;
        if (proj < polyMin) polyMin = proj;
        if (proj > polyMax) polyMax = proj;
      }
      const depthPos = polyMax - aabbMin; // move +axis until the body's min clears this polygon's max
      const depthNeg = aabbMax - polyMin; // move -axis until the body's max clears this polygon's min
      if (depthPos > maxDepthPos) maxDepthPos = depthPos;
      if (depthNeg > maxDepthNeg) maxDepthNeg = depthNeg;
    }

    const depth = Math.min(maxDepthPos, maxDepthNeg);
    if (depth < bestDepth) {
      bestDepth = depth;
      bestAxis = axis;
      bestSign = maxDepthPos <= maxDepthNeg ? 1 : -1;
    }
  }

  if (!bestAxis || bestDepth < 1e-6) return { x: 0, y: 0 };
  const push = bestDepth + PUSH_SKIN;
  return { x: bestAxis.x * push * bestSign, y: bestAxis.y * push * bestSign };
}

/** Cap on how many times escapePush widens its cluster before giving up and returning its best answer so far. Every round adds at least one polygon, so this bounds it at "clusters up to 8 pieces deep resolve in one frame"; anything worse just takes another frame. */
const ESCAPE_ROUNDS = 8;

/**
 * Displacement that gets a body embedded in furniture back out into open
 * floor, or {x:0,y:0} if it isn't embedded.
 *
 * A plain minimum-translation escape is LOCAL, and that isn't enough here.
 * Footprints are decomposed into adjacent convex pieces, so the cheapest way
 * out of piece A is very often a short hop straight into neighbour B, whose
 * own cheapest way out is a hop back into A. The body then oscillates between
 * two interior positions forever and reads as frozen solid inside the
 * furniture — the real "Mimi gets stuck" failure, reproducible by dropping
 * her in the middle of the dining set. Solving A and B together doesn't fix
 * it either, because at any one instant she only overlaps one of them.
 *
 * So: solve, and if the answer lands her in something new, fold that piece
 * into the cluster and re-solve FROM THE ORIGINAL POSITION with the wider
 * set. Each round the answer has to clear strictly more of the cluster, so it
 * walks outward to an escape that clears the whole decomposed region in one
 * translation, instead of ping-ponging around inside it.
 */
function escapePush(polygons: readonly (readonly Point[])[], cx: number, cy: number, halfW: number, halfH: number): Point {
  const cluster = overlappingPolygons(polygons, cx, cy, halfW, halfH);
  if (cluster.length === 0) return { x: 0, y: 0 };

  let best: Point = { x: 0, y: 0 };
  for (let round = 0; round < ESCAPE_ROUNDS; round++) {
    const push = setPushOut(cluster, cx, cy, halfW, halfH);
    if (push.x === 0 && push.y === 0) return best;
    best = push;
    const landed = overlappingPolygons(polygons, cx + push.x, cy + push.y, halfW, halfH);
    if (landed.length === 0) return push;
    let widened = false;
    for (const polygon of landed) {
      if (cluster.includes(polygon)) continue;
      cluster.push(polygon);
      widened = true;
    }
    if (!widened) return push; // nothing new to learn; take the best answer we have
  }
  return best;
}

/**
 * Resolves Mimi's body against every furniture polygon for one physics step.
 *
 * First de-penetrates: pushes the body clear of the whole cluster of pieces
 * it's embedded in (see escapePush) so she can never stay wedged no matter
 * how she got there — a wall's own instant Arcade separation shoving her
 * sideways into furniture flush against it, a spawn overlap, anything. This
 * runs unconditionally, independent of her current velocity, which is what
 * makes it an actual escape instead of just another "don't move into it"
 * check.
 *
 * Then, from that corrected position, removes only the part of her velocity
 * that points INTO the furniture this step, leaving the part that runs along
 * its surface — so she slides around furniture instead of stopping dead
 * against it. That's v -= n * (v·n), with n the same set-wise push-out
 * direction used for de-penetration.
 *
 * This replaced a per-world-axis "zero vx if moving in X would overlap, then
 * zero vy likewise" test. That only slides along edges that happen to run
 * along world X or Y; against anything diagonal (the bed's angled frame, the
 * kitchen's corner run, any rotated piece) BOTH axis probes report a hit, so
 * both axes got zeroed and she stuck fast to the edge. Projecting onto the
 * contact surface slides at any angle. Two passes, so an inside corner —
 * two surfaces at once — resolves as well; if the step is still inside
 * something after that there's genuinely nowhere to slide, so she stops.
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

  const escape = escapePush(polygons, x, y, halfW, halfH);
  x += escape.x;
  y += escape.y;

  if (dt <= 0 || polygons.length === 0 || (vx === 0 && vy === 0)) return { x, y, vx, vy };

  let resolvedVx = vx;
  let resolvedVy = vy;
  for (let pass = 0; pass < 2; pass++) {
    // The LOCAL contact push here, not escapePush: this wants the normal of
    // the surface she's about to press against, not the way out of a cluster.
    const probeX = x + resolvedVx * dt;
    const probeY = y + resolvedVy * dt;
    const push = setPushOut(overlappingPolygons(polygons, probeX, probeY, halfW, halfH), probeX, probeY, halfW, halfH);
    const length = Math.hypot(push.x, push.y);
    if (length === 0) return { x, y, vx: resolvedVx, vy: resolvedVy }; // this step is clear — walk it
    const nx = push.x / length;
    const ny = push.y / length;
    const into = resolvedVx * nx + resolvedVy * ny;
    if (into >= 0) break; // not actually driving into it; nothing left to project out
    resolvedVx -= nx * into;
    resolvedVy -= ny * into;
  }

  if (overlappingPolygons(polygons, x + resolvedVx * dt, y + resolvedVy * dt, halfW, halfH).length > 0) {
    return { x, y, vx: 0, vy: 0 }; // boxed in — nowhere to slide
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
