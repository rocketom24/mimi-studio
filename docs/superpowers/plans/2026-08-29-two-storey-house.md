# Two-Storey House Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5×2 hotel-grid layout with a 4-room ground floor + 2-room first floor connected by a walkable staircase, without touching movement, input, camera rotation, projection, occlusion, or interaction internals.

**Architecture:** Both floors reuse the identical 512×288 world rectangle (never expanded); only one floor's geometry is visible/collidable/interactable at a time, toggled by a new `activeLevel` field on `StudioScene`. `game/world/rooms.ts` gains a second export, `STAIRCASES`, alongside the existing `ROOMS`. `wallSystem.ts`'s wall computation is rewritten from a hardcoded two-row-plus-corridor algorithm to a generic per-room-edge algorithm that also handles the staircase nooks and 4-sided doors.

**Tech Stack:** Next.js 16 + Phaser 3.90, TypeScript. No test framework is present in this repo (`package.json` has no jest/vitest/playwright-test) — this plan does not add one. Per-task verification uses `npx tsc --noEmit` for pure-data/logic tasks, and the Playwright MCP browser tools against `npm run dev` for scene-wiring tasks, matching the project's own existing validation practice (`npx tsc --noEmit && npm run lint && npm run build` + manual browser testing).

**Spec:** `docs/superpowers/specs/2026-08-29-two-storey-house-design.md`

## Global Constraints

- World stays 512×288 px (64×36 tiles, `TILE_SIZE = 8`). Never expand it.
- Do not modify: `game/world/projection.ts`, `game/world/cameraController.ts`, `game/world/occlusionSystem.ts`, `game/world/depth.ts`, `game/interactions/InteractionSystem.ts`, `game/interactions/InteractionPrompt.ts` (behavior — it may gain a second instance, not new internals), `game/input/*`, `game/entities/Player.ts` (movement logic — only its two spawn constants change), the React/Phaser bridge, or portfolio panel code.
- `game/world/rooms.ts` stays the single source of truth for room and staircase geometry.
- Existing interactable IDs and `panelId`s (`contact`, `about`, `experience`, `cv`, `projects`, `skills`, `education`) are never renamed or removed.
- No corridor concept — every room (and each staircase nook) fully tiles its own footprint; leftover space outside any room is sealed behind a solid wall and never rendered as floor.

---

## File Structure

| File | Responsibility |
|---|---|
| `game/types/world.ts` | Add `Level`, extend `DoorSide`, add `StaircaseDef` |
| `game/world/rooms.ts` | New `ROOMS` (6 rooms, 2 levels), new `STAIRCASES`, new `roomAt()` query helper |
| `game/config/world.ts` | Reposition `EXTERIOR_DOOR`, remove `CORRIDOR_FLOOR_COLOR` |
| `game/world/wallSystem.ts` | Per-room-edge wall algorithm, level-parameterized |
| `game/world/floorSystem.ts` | Remove `createCorridorFloor` |
| `game/world/collision.ts` | Level-parameterized, called once per level |
| `game/world/staircase.ts` (new) | Stairwell nook floor/visual + overlap test |
| `game/data/interactables.ts` | Reposition room references |
| `game/entities/Player.ts` | New spawn tile constants only |
| `game/scenes/StudioScene.ts` | `activeLevel` state, doubled layer/collision/interaction bookkeeping, staircase transition |

---

### Task 1: Types and room/staircase data

**Files:**
- Modify: `game/types/world.ts`
- Modify: `game/world/rooms.ts`

**Interfaces:**
- Produces: `Level = 0 | 1`, `LEVELS: readonly Level[]`, `DoorSide` (now includes `"east" | "west"`), `StaircaseDef { id, level, tiles, toLevel, toTile: { x, y } }`, `RoomDef.level: Level`, `ROOMS: RoomDef[]` (6 entries), `STAIRCASES: StaircaseDef[]` (2 entries), `roomAt(worldX: number, worldY: number): RoomDef | undefined`.

- [ ] **Step 1: Extend `game/types/world.ts`**

Add `Level`/`LEVELS`, widen `DoorSide`, add `level` to `RoomDef`, add `StaircaseDef`:

```ts
export type Level = 0 | 1;
export const LEVELS: readonly Level[] = [0, 1];

export type DoorSide = "north" | "south" | "east" | "west";
```

Add `level: Level;` as a new field on `RoomDef` (place it right after `id`):

```ts
export interface RoomDef {
  id: string;
  level: Level;
  label: string;
  tiles: TileRect;
  floorColor: number;
  floorType: FloorType;
  doors: DoorGap[];
  furniture: FurniturePiece[];
  windows?: PixelRect[];
}
```

Append at the end of the file:

```ts
export interface StaircaseDef {
  id: string;
  level: Level;
  tiles: TileRect;
  toLevel: Level;
  toTile: { x: number; y: number };
}
```

- [ ] **Step 2: Run the type checker to confirm the intentional breakage**

Run: `npx tsc --noEmit`
Expected: errors in `game/world/rooms.ts` (every `RoomDef` literal missing `level`), and downstream errors in `game/world/wallSystem.ts`, `game/world/collision.ts`, `game/data/interactables.ts`, `game/scenes/StudioScene.ts`. No errors anywhere else. This is expected — those files are fixed in later tasks.

- [ ] **Step 3: Replace `game/world/rooms.ts` entirely**

```ts
import type { RoomDef, StaircaseDef } from "@/game/types/world";
import { TILE_SIZE } from "@/game/config/world";

const px = (tiles: number) => tiles * TILE_SIZE;

export const ROOMS: RoomDef[] = [
  {
    id: "entrance",
    level: 0,
    label: "ENTRANCE",
    tiles: { x: 4, y: 1, w: 12, h: 8 },
    floorColor: 0x2b2340,
    floorType: "wood",
    doors: [
      { side: "north", offset: 4, length: 3 },
      { side: "south", offset: 4, length: 3 },
    ],
    furniture: [
      { x: 2, y: 1, w: 2, h: 1, color: 0x4a3a63, kind: "shelf" },
      { x: 5, y: 5, w: 3, h: 2, color: 0x1c1626, solid: false, kind: "mat" },
    ],
  },
  {
    id: "living-room",
    level: 0,
    label: "LIVING ROOM",
    tiles: { x: 2, y: 10, w: 48, h: 16 },
    floorColor: 0x2e2440,
    floorType: "wood",
    doors: [{ side: "east", offset: 4, length: 3 }],
    windows: [{ x: px(20), y: px(9), w: px(4), h: TILE_SIZE - 2 }],
    furniture: [
      { x: 3, y: 1, w: 4, h: 2, color: 0x1c1626, kind: "tv" },
      { x: 3, y: 9, w: 7, h: 3, color: 0x6f5c9e, kind: "sofa" },
      { x: 5, y: 6, w: 2, h: 2, color: 0x8a5a3c, kind: "coffeeTable" },
      { x: 40, y: 2, w: 2, h: 1, color: 0x4a3a63, kind: "shelf" },
    ],
  },
  {
    id: "kitchen",
    level: 0,
    label: "KITCHEN",
    tiles: { x: 2, y: 27, w: 22, h: 7 },
    floorColor: 0x39332a,
    floorType: "tile",
    doors: [{ side: "north", offset: 9, length: 3 }],
    furniture: [
      { x: 1, y: 1, w: 2, h: 3, color: 0xd8d8d8, kind: "fridge" },
      { x: 1, y: 4, w: 8, h: 2, color: 0x8894a3, kind: "counter" },
      { x: 12, y: 2, w: 3, h: 3, color: 0x8a5a3c, kind: "diningTable" },
    ],
  },
  {
    id: "cat-room",
    level: 0,
    label: "CAT ROOM",
    tiles: { x: 28, y: 27, w: 22, h: 7 },
    floorColor: 0x2c2438,
    floorType: "wood",
    doors: [{ side: "north", offset: 9, length: 3 }],
    furniture: [],
  },
  {
    id: "bedroom",
    level: 1,
    label: "BEDROOM",
    tiles: { x: 2, y: 6, w: 32, h: 22 },
    floorColor: 0x2c2438,
    floorType: "wood",
    doors: [{ side: "east", offset: 4, length: 3 }],
    windows: [{ x: px(15), y: px(5), w: px(4), h: TILE_SIZE - 2 }],
    furniture: [
      { x: 2, y: 3, w: 6, h: 4, color: 0x6f5c9e, kind: "bed" },
      { x: 9, y: 3, w: 2, h: 2, color: 0x8a5a3c, kind: "nightstand" },
      { x: 2, y: 14, w: 2, h: 5, color: 0x8a5a3c, kind: "bookshelf" },
    ],
  },
  {
    id: "study",
    level: 1,
    label: "STUDY + COMPUTER",
    tiles: { x: 43, y: 6, w: 17, h: 22 },
    floorColor: 0x2b2536,
    floorType: "wood",
    doors: [{ side: "west", offset: 4, length: 3 }],
    furniture: [
      { x: 2, y: 3, w: 5, h: 2, color: 0x8a5a3c, kind: "desk" },
      { x: 3, y: 3, w: 2, h: 1, color: 0x4ad0e8, solid: false, kind: "computer" },
      { x: 3, y: 5, w: 2, h: 2, color: 0x6f5c9e, kind: "chair" },
      { x: 10, y: 3, w: 2, h: 5, color: 0x8a5a3c, kind: "bookshelf" },
      { x: 2, y: 12, w: 3, h: 2, color: 0x4ad0e8, kind: "workstation" },
      { x: 7, y: 12, w: 6, h: 3, color: 0x8a5a3c, kind: "displayTable" },
    ],
  },
];

/**
 * Ground-floor stairwell nook: 51-59 x, 10-18 y — its west wall (x-1=50)
 * meets Living Room's east wall (2+48=50) exactly, so Living Room's east
 * door opens straight into it. First-floor nook: 35-42 x, 10-18 y — its
 * west wall (35-1=34) meets Bedroom's east wall (2+32=34), and its east
 * wall (35+7=42) meets Study's west wall (43-1=42).
 *
 * The whole nook rect IS the transition trigger (no separate smaller
 * "step" sub-zone) — stepping anywhere in it starts the floor change.
 * Each `toTile` lands just inside the DESTINATION room at its doorway
 * threshold (not inside the nook), so arrival is never inside a trigger
 * zone and no re-trigger cooldown is needed.
 */
export const STAIRCASES: StaircaseDef[] = [
  {
    id: "stairs-up",
    level: 0,
    tiles: { x: 51, y: 10, w: 8, h: 8 },
    toLevel: 1,
    toTile: { x: 32, y: 11 },
  },
  {
    id: "stairs-down",
    level: 1,
    tiles: { x: 35, y: 10, w: 7, h: 8 },
    toLevel: 0,
    toTile: { x: 48, y: 15 },
  },
];

/** Finds which room's tile rect contains a world-pixel point. Rooms never overlap, so this is unambiguous. Used to derive an interactable's level from its position. */
export function roomAt(worldX: number, worldY: number): RoomDef | undefined {
  return ROOMS.find((room) => {
    const x = px(room.tiles.x);
    const y = px(room.tiles.y);
    return worldX >= x && worldX < x + px(room.tiles.w) && worldY >= y && worldY < y + px(room.tiles.h);
  });
}
```

- [ ] **Step 4: Run the type checker again**

Run: `npx tsc --noEmit`
Expected: no more errors in `game/world/rooms.ts` or `game/types/world.ts`. Errors remain in `game/world/wallSystem.ts`, `game/world/collision.ts`, `game/data/interactables.ts`, `game/scenes/StudioScene.ts` (fixed in later tasks).

- [ ] **Step 5: Commit**

```bash
git add game/types/world.ts game/world/rooms.ts
git commit -m "feat: replace hotel room grid with two-storey house data model"
```

---

### Task 2: Reposition the exterior door, drop the corridor color

**Files:**
- Modify: `game/config/world.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EXTERIOR_DOOR = { x: 8, length: 3 }` (world tile x, aligned with Entrance's own north door — `entrance.tiles.x (4) + offset (4) = 8`). `CORRIDOR_FLOOR_COLOR` removed.

- [ ] **Step 1: Edit `game/config/world.ts`**

Change:

```ts
export const EXTERIOR_DOOR = { x: 5, length: 3 };
```

to:

```ts
// Front door: a gap in the north world border, aligned with Entrance's own
// north door (offset 4 into a room starting at tile x 4) so the two line up.
export const EXTERIOR_DOOR = { x: 8, length: 3 };
```

Delete the line:

```ts
export const CORRIDOR_FLOOR_COLOR = 0x241c33;
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: new errors in `game/world/floorSystem.ts` and `game/scenes/StudioScene.ts` (both reference `CORRIDOR_FLOOR_COLOR`, fixed in Tasks 4 and 9). No errors in `game/config/world.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add game/config/world.ts
git commit -m "feat: align front door with new Entrance room, drop corridor color"
```

---

### Task 3: Generalize wall generation

**Files:**
- Modify: `game/world/wallSystem.ts`

**Interfaces:**
- Consumes: `ROOMS`, `STAIRCASES`, `roomAt` from `@/game/world/rooms`; `Level` from `@/game/types/world`; `EXTERIOR_DOOR` from `@/game/config/world`.
- Produces: `computeWallRects(level: Level): PixelRect[]` (was zero-arg), `createWalls(scene, orientation, level: Level): WallSegment[]` (new `level` param), `createDoorDecorations(scene, orientation, level: Level): Graphics` (new `level` param). `createWindows` signature is unchanged.

- [ ] **Step 1: Replace the imports and delete the row-pair helpers**

Replace:

```ts
import { BOTTOM_Y, ROOMS, TOP_H, TOP_Y } from "@/game/world/rooms";
```

with:

```ts
import { ROOMS, STAIRCASES } from "@/game/world/rooms";
import type { Level } from "@/game/types/world";
```

Delete the `rowSegments()` function entirely (replaced below).

- [ ] **Step 2: Write the generic gap-collection and wall-segment helpers**

Add, above `computeWallRects`:

```ts
interface WallGap {
  /** "h" = a gap in a horizontal wall line (north/south doors), fixed at a world Y. "v" = a gap in a vertical wall line (east/west doors), fixed at a world X. */
  axis: "h" | "v";
  pos: number;
  from: number;
  to: number;
}

/** Every door gap declared by any room on this level, in world-pixel space. A shared wall between two rooms only needs ONE of them to declare the door — this list is matched purely by position, not by which room declared it, so it cuts the gap into both rooms' facing walls automatically. */
function collectDoorGaps(rooms: RoomDef[]): WallGap[] {
  const gaps: WallGap[] = [];
  for (const room of rooms) {
    const x = px(room.tiles.x);
    const y = px(room.tiles.y);
    const w = px(room.tiles.w);
    const h = px(room.tiles.h);
    for (const door of room.doors) {
      const from = px(door.offset) + (door.side === "north" || door.side === "south" ? x : y);
      const to = from + px(door.length);
      if (door.side === "north") gaps.push({ axis: "h", pos: y, from, to });
      else if (door.side === "south") gaps.push({ axis: "h", pos: y + h, from, to });
      else if (door.side === "west") gaps.push({ axis: "v", pos: x, from, to });
      else gaps.push({ axis: "v", pos: x + w, from, to });
    }
  }
  return gaps;
}

/** One wall line (fixed at `pos` on `axis`, spanning `[spanStart, spanEnd)`), split into segments that leave gaps for whichever WallGaps land on this exact line. */
function wallLine(axis: "h" | "v", pos: number, spanStart: number, spanEnd: number, gaps: WallGap[]): PixelRect[] {
  const onThisLine = gaps
    .filter((g) => g.axis === axis && g.pos === pos)
    .sort((a, b) => a.from - b.from);
  const rects: PixelRect[] = [];
  let cursor = spanStart;
  for (const gap of onThisLine) {
    if (gap.from > cursor) {
      rects.push(axis === "h" ? { x: cursor, y: pos, w: gap.from - cursor, h: TILE_SIZE } : { x: pos, y: cursor, w: TILE_SIZE, h: gap.from - cursor });
    }
    cursor = Math.max(cursor, gap.to);
  }
  if (cursor < spanEnd) {
    rects.push(axis === "h" ? { x: cursor, y: pos, w: spanEnd - cursor, h: TILE_SIZE } : { x: pos, y: cursor, w: TILE_SIZE, h: spanEnd - cursor });
  }
  return rects;
}

/** All 4 wall-bearing edges of one rect-shaped zone (a room or a staircase nook), each edge occupying the tile row/column immediately outside the zone's own footprint — never overlapping its floor. */
function zoneEdgeWalls(tiles: { x: number; y: number; w: number; h: number }, gaps: WallGap[]): PixelRect[] {
  const x = px(tiles.x);
  const y = px(tiles.y);
  const w = px(tiles.w);
  const h = px(tiles.h);
  return [
    ...wallLine("h", y - TILE_SIZE, x, x + w, gaps), // north
    ...wallLine("h", y + h, x, x + w, gaps), // south
    ...wallLine("v", x - TILE_SIZE, y, y + h, gaps), // west
    ...wallLine("v", x + w, y, y + h, gaps), // east
  ];
}
```

- [ ] **Step 3: Replace `computeWallRects`**

```ts
export function computeWallRects(level: Level): PixelRect[] {
  const rooms = ROOMS.filter((r) => r.level === level);
  const stairs = STAIRCASES.filter((s) => s.level === level);
  const gaps = collectDoorGaps(rooms);

  const exteriorGaps = level === 0 ? [EXTERIOR_DOOR] : [];
  const rects: PixelRect[] = [
    ...rowSegmentsForBorder(0, 0, WORLD_TILE_WIDTH, exteriorGaps),
    ...rowSegmentsForBorder(WORLD_TILE_HEIGHT - 1, 0, WORLD_TILE_WIDTH, []),
    { x: 0, y: 0, w: TILE_SIZE, h: WORLD_PIXEL_HEIGHT },
    { x: px(WORLD_TILE_WIDTH - 1), y: 0, w: TILE_SIZE, h: WORLD_PIXEL_HEIGHT },
  ];

  for (const room of rooms) rects.push(...zoneEdgeWalls(room.tiles, gaps));
  for (const stair of stairs) rects.push(...zoneEdgeWalls(stair.tiles, gaps));

  return rects;
}
```

`rowSegmentsForBorder` is the old `rowSegments` (tile-gap based, kept for just the two full-width border rows — the exterior door is a gap in world-tile-x terms, unlike interior doors which are now pixel-based `WallGap`s). Add it back as a small standalone helper, unchanged from the original:

```ts
function rowSegmentsForBorder(
  yTile: number,
  xStartTile: number,
  xEndTile: number,
  gaps: Array<{ x: number; length: number }>,
): PixelRect[] {
  const y = px(yTile);
  const sorted = [...gaps].sort((a, b) => a.x - b.x);
  const segments: PixelRect[] = [];
  let cursor = xStartTile;
  for (const gap of sorted) {
    if (gap.x > cursor) segments.push({ x: px(cursor), y, w: px(gap.x - cursor), h: TILE_SIZE });
    cursor = gap.x + gap.length;
  }
  if (cursor < xEndTile) segments.push({ x: px(cursor), y, w: px(xEndTile - cursor), h: TILE_SIZE });
  return segments;
}
```

Add the missing `RoomDef` type import: `import type { PixelRect, RoomDef } from "@/game/types/world";` (already present — confirm it's still there; `RoomDef` was already imported in the original file).

- [ ] **Step 4: Update `createWalls` to take `level`**

Change:

```ts
export function createWalls(scene: Phaser.Scene, orientation: ViewOrientation): WallSegment[] {
  const segments: WallSegment[] = [];
  for (const rect of computeWallRects()) {
```

to:

```ts
export function createWalls(scene: Phaser.Scene, orientation: ViewOrientation, level: Level): WallSegment[] {
  const segments: WallSegment[] = [];
  for (const rect of computeWallRects(level)) {
```

- [ ] **Step 5: Replace `computeDoorGaps`/`createDoorDecorations` with the level-aware version**

Delete the old `computeDoorGaps()` function. Replace `createDoorDecorations`:

```ts
export function createDoorDecorations(scene: Phaser.Scene, orientation: ViewOrientation, level: Level): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DEPTH.LABEL_BASE);
  const postColor = darken(WALL_COLOR, 20);
  const thresholdColor = darken(WALL_COLOR, 34);

  const rooms = ROOMS.filter((r) => r.level === level);
  const gaps = collectDoorGaps(rooms);
  const gapRects: PixelRect[] = gaps.map((gap) =>
    gap.axis === "h"
      ? { x: gap.from, y: gap.pos, w: gap.to - gap.from, h: TILE_SIZE }
      : { x: gap.pos, y: gap.from, w: TILE_SIZE, h: gap.to - gap.from },
  );
  if (level === 0) {
    gapRects.push({ x: px(EXTERIOR_DOOR.x), y: 0, w: px(EXTERIOR_DOOR.length), h: TILE_SIZE });
  }

  for (const gap of gapRects) {
    const view = toViewRect(gap, orientation);
    const anchor = project(view.x, view.y);

    g.fillStyle(postColor, 1);
    g.fillRect(anchor.x, anchor.y, 2, view.h);
    g.fillRect(anchor.x + view.w - 2, anchor.y, 2, view.h);

    g.fillStyle(thresholdColor, 0.6);
    g.fillRect(anchor.x + 2, anchor.y + view.h - 2, view.w - 4, 2);

    g.fillStyle(0x000000, 0.22);
    g.fillRect(anchor.x + 2, anchor.y + view.h, view.w - 4, 1);
  }

  return g;
}
```

`createWindows` is unchanged — leave it exactly as-is.

- [ ] **Step 6: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors in `game/world/wallSystem.ts`. Errors remain in `game/world/collision.ts` and `game/scenes/StudioScene.ts` (call `createWalls`/`createDoorDecorations`/`computeWallRects` without the new `level` arg — fixed in Tasks 5 and 9).

- [ ] **Step 7: Commit**

```bash
git add game/world/wallSystem.ts
git commit -m "refactor: generalize wall generation to a per-room-edge, level-aware algorithm"
```

---

### Task 4: Remove the corridor floor

**Files:**
- Modify: `game/world/floorSystem.ts`

**Interfaces:**
- Produces: `createRoomFloor` unchanged. `createCorridorFloor` removed.

- [ ] **Step 1: Delete `createCorridorFloor` and its now-unused imports**

Remove the entire `createCorridorFloor` function (the last function in the file). Remove `WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH` from the `@/game/config/world` import if `createRoomFloor` doesn't otherwise use them (it doesn't — only `TILE_SIZE` is needed from that module). The import line becomes:

```ts
import { TILE_SIZE } from "@/game/config/world";
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors in `game/world/floorSystem.ts`. `game/scenes/StudioScene.ts` still errors (still calls `createCorridorFloor` — fixed in Task 9).

- [ ] **Step 3: Commit**

```bash
git add game/world/floorSystem.ts
git commit -m "refactor: remove the corridor floor, no longer needed without the hotel layout"
```

---

### Task 5: Level-aware collision

**Files:**
- Modify: `game/world/collision.ts`

**Interfaces:**
- Consumes: `computeWallRects(level: Level)` from Task 3, `ROOMS`, `Level`.
- Produces: `createWorldCollision(scene: Phaser.Scene, level: Level): Phaser.Physics.Arcade.StaticGroup` (new `level` param), `setGroupEnabled(group: Phaser.Physics.Arcade.StaticGroup, enabled: boolean): void` (new).

- [ ] **Step 1: Add the `level` parameter and filter rooms**

```ts
import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { ROOMS } from "@/game/world/rooms";
import { computeWallRects } from "@/game/world/wallSystem";
import type { Level } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;

function addStaticRect(
  scene: Phaser.Scene,
  group: Phaser.Physics.Arcade.StaticGroup,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const rect = scene.add.rectangle(x + w / 2, y + h / 2, w, h);
  rect.setVisible(false);
  scene.physics.add.existing(rect, true);
  group.add(rect);
}

export function createWorldCollision(scene: Phaser.Scene, level: Level): Phaser.Physics.Arcade.StaticGroup {
  const group = scene.physics.add.staticGroup();

  for (const rect of computeWallRects(level)) {
    addStaticRect(scene, group, rect.x, rect.y, rect.w, rect.h);
  }

  for (const room of ROOMS.filter((r) => r.level === level)) {
    for (const piece of room.furniture) {
      if (piece.solid === false) continue;
      addStaticRect(
        scene,
        group,
        px(room.tiles.x) + px(piece.x),
        px(room.tiles.y) + px(piece.y),
        px(piece.w),
        px(piece.h),
      );
    }
  }

  return group;
}

/** Both levels' collision bodies are built once at scene creation and live in the same 0-512x0-288 world space; only the active level's bodies should ever block the player. */
export function setGroupEnabled(group: Phaser.Physics.Arcade.StaticGroup, enabled: boolean): void {
  group.children.iterate((child) => {
    const body = (child as Phaser.GameObjects.GameObject & { body: Phaser.Physics.Arcade.StaticBody }).body;
    body.enable = enabled;
    return true;
  });
}
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors in `game/world/collision.ts`. Only `game/scenes/StudioScene.ts` still errors (fixed in Task 9).

- [ ] **Step 3: Commit**

```bash
git add game/world/collision.ts
git commit -m "feat: build collision per level, add a group enable/disable toggle"
```

---

### Task 6: Staircase visual + overlap helper

**Files:**
- Create: `game/world/staircase.ts`

**Interfaces:**
- Consumes: `StaircaseDef` from `@/game/types/world`, `project`/`toViewRect`/`ViewOrientation` from `@/game/world/projection`, `DEPTH` from `@/game/world/depth`, `darken`/`lighten` from `@/game/world/palette`, `TILE_SIZE` from `@/game/config/world`.
- Produces: `createStaircaseVisual(scene, stair: StaircaseDef, orientation): Phaser.GameObjects.Graphics`, `isOnStaircase(stair: StaircaseDef, worldX: number, worldY: number): boolean`.

- [ ] **Step 1: Write the module**

```ts
import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { darken, lighten } from "@/game/world/palette";
import { DEPTH } from "@/game/world/depth";
import { project, toViewRect } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";
import type { StaircaseDef } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;
const STEP_COLOR = 0x4a3a63;
const NOOK_FLOOR_COLOR = 0x241c33;

/** Renders one stairwell nook: a plain floor patch distinct from any room's floor, plus 3 ascending step blocks against its back edge to read as "going upstairs." */
export function createStaircaseVisual(scene: Phaser.Scene, stair: StaircaseDef, orientation: ViewOrientation): Phaser.GameObjects.Graphics {
  const x = px(stair.tiles.x);
  const y = px(stair.tiles.y);
  const w = px(stair.tiles.w);
  const h = px(stair.tiles.h);

  const g = scene.add.graphics().setDepth(DEPTH.FLOOR);
  const floorView = toViewRect({ x, y, w, h }, orientation);
  const nw = project(floorView.x, floorView.y);
  const ne = project(floorView.x + floorView.w, floorView.y);
  const se = project(floorView.x + floorView.w, floorView.y + floorView.h);
  const sw = project(floorView.x, floorView.y + floorView.h);
  g.fillStyle(NOOK_FLOOR_COLOR, 1);
  g.fillPoints([nw, ne, se, sw], true);

  const stepCount = 3;
  const stepDepth = h / stepCount;
  for (let i = 0; i < stepCount; i++) {
    const stepRect = { x, y: y + i * stepDepth, w, h: stepDepth };
    const view = toViewRect(stepRect, orientation);
    const stepColor = i % 2 === 0 ? lighten(STEP_COLOR, 8) : darken(STEP_COLOR, 8);
    const riseZ = (stepCount - i) * 3;
    const topLeft = project(view.x, view.y, riseZ);
    const topRight = project(view.x + view.w, view.y, riseZ);
    const bottomRight = project(view.x + view.w, view.y + view.h, riseZ);
    const bottomLeft = project(view.x, view.y + view.h, riseZ);
    g.fillStyle(stepColor, 1);
    g.fillPoints([topLeft, topRight, bottomRight, bottomLeft], true);
  }

  return g;
}

/** Whether a world-pixel point sits inside a staircase's trigger footprint. */
export function isOnStaircase(stair: StaircaseDef, worldX: number, worldY: number): boolean {
  const x = px(stair.tiles.x);
  const y = px(stair.tiles.y);
  return worldX >= x && worldX < x + px(stair.tiles.w) && worldY >= y && worldY < y + px(stair.tiles.h);
}
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors in `game/world/staircase.ts`. Same remaining error set as before (`game/scenes/StudioScene.ts` only).

- [ ] **Step 3: Commit**

```bash
git add game/world/staircase.ts
git commit -m "feat: add staircase nook visual and overlap detection"
```

---

### Task 7: Reposition interactables

**Files:**
- Modify: `game/data/interactables.ts`

**Interfaces:**
- Produces: same `INTERACTABLES: Interactable[]` shape, same 7 `id`/`panelId` values, new room references.

- [ ] **Step 1: Replace the `INTERACTABLES` array**

```ts
export const INTERACTABLES: Interactable[] = [
  {
    id: "contact",
    ...roomPoint("entrance", 3, 2),
    radius: INTERACTION_RADIUS,
    prompt: "[E] Contact Mimi",
    panelId: "contact",
  },
  {
    id: "about",
    ...roomPoint("living-room", 6, 10),
    radius: INTERACTION_RADIUS,
    prompt: "[E] About Mimi",
    panelId: "about",
  },
  {
    id: "experience",
    ...roomPoint("living-room", 41, 3),
    radius: INTERACTION_RADIUS,
    prompt: "[E] View Experience",
    panelId: "experience",
  },
  {
    id: "quick-cv",
    ...roomPoint("study", 3, 3),
    radius: INTERACTION_RADIUS,
    prompt: "[E] Quick CV",
    panelId: "cv",
  },
  {
    id: "projects",
    ...roomPoint("study", 9, 13),
    radius: INTERACTION_RADIUS,
    prompt: "[E] View Projects",
    panelId: "projects",
  },
  {
    id: "skills",
    ...roomPoint("study", 3, 13),
    radius: INTERACTION_RADIUS,
    prompt: "[E] View Skills",
    panelId: "skills",
  },
  {
    id: "education",
    ...roomPoint("bedroom", 3, 16),
    radius: INTERACTION_RADIUS,
    prompt: "[E] Education",
    panelId: "education",
  },
];
```

The `roomPoint` helper and `INTERACTION_RADIUS` constant above it are unchanged.

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors in `game/data/interactables.ts`. Only `game/scenes/StudioScene.ts` errors remain.

- [ ] **Step 3: Commit**

```bash
git add game/data/interactables.ts
git commit -m "feat: reposition portfolio interactables into the new house layout"
```

---

### Task 8: Reposition player spawn

**Files:**
- Modify: `game/entities/Player.ts`

**Interfaces:**
- Produces: `PLAYER_SPAWN_TILE_X/Y`, `PLAYER_SPAWN_X/Y` — same names, new values. Nothing else in the file changes.

- [ ] **Step 1: Update the spawn constants**

Change:

```ts
// Entry room floor, a few tiles up from the south door (tiles 5-7 @ row 15),
// clear of the mail shelf and mat furniture.
export const PLAYER_SPAWN_TILE_X = 7;
export const PLAYER_SPAWN_TILE_Y = 12;
```

to:

```ts
// Entrance floor (world tiles x4-16, y1-9), clear of the shelf at world
// (6,2) and the mat at world (9,6)-(12,8).
export const PLAYER_SPAWN_TILE_X = 7;
export const PLAYER_SPAWN_TILE_Y = 3;
```

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors in `game/entities/Player.ts`. Only `game/scenes/StudioScene.ts` errors remain.

- [ ] **Step 3: Commit**

```bash
git add game/entities/Player.ts
git commit -m "feat: spawn Mimi inside the new Entrance room"
```

---

### Task 9: StudioScene — level-aware rendering layers

**Files:**
- Modify: `game/scenes/StudioScene.ts`

**Interfaces:**
- Consumes: `ROOMS`, `STAIRCASES`, `LEVELS`, `Level` from Task 1; `createStaircaseVisual` from Task 6; level-aware `createWalls`/`createDoorDecorations` from Task 3; `createRoomFloor` (unchanged) from Task 4.
- Produces: `StudioScene.activeLevel: Level` (new private field, starts `0`), a `layerKey(level, orientation)` helper, `layerObjects`/`wallSegmentsByOrientation` re-keyed by `(level, orientation)`.

This task makes the scene build and correctly show/hide 8 layers (2 levels × 4 orientations) instead of 4, with only the ground floor ever active (no way to reach the first floor yet — that's Task 12). Camera rotation must keep working exactly as before, on whichever level is active.

- [ ] **Step 1: Update imports**

Replace:

```ts
import { CORRIDOR_FLOOR_COLOR, WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
import { ORIENTATIONS, projectedSizeFor } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";
import { ROOMS } from "@/game/world/rooms";
import { createRoomLabel } from "@/game/world/studioWorld";
import { createCorridorFloor, createRoomFloor } from "@/game/world/floorSystem";
import { createDoorDecorations, createWalls, createWindows, type WallSegment } from "@/game/world/wallSystem";
import { createFurniture } from "@/game/world/furnitureSystem";
import { createWorldCollision } from "@/game/world/collision";
```

with:

```ts
import { WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
import { ORIENTATIONS, projectedSizeFor } from "@/game/world/projection";
import type { ViewOrientation } from "@/game/world/projection";
import { ROOMS, STAIRCASES } from "@/game/world/rooms";
import { LEVELS } from "@/game/types/world";
import type { Level } from "@/game/types/world";
import { createRoomLabel } from "@/game/world/studioWorld";
import { createRoomFloor } from "@/game/world/floorSystem";
import { createDoorDecorations, createWalls, createWindows, type WallSegment } from "@/game/world/wallSystem";
import { createFurniture } from "@/game/world/furnitureSystem";
import { createWorldCollision } from "@/game/world/collision";
import { createStaircaseVisual } from "@/game/world/staircase";
```

- [ ] **Step 2: Add `activeLevel` and a composite layer key**

Add the field next to the existing `rotationPivotX` field:

```ts
private activeLevel: Level = 0;
```

Change the two layer maps' key type from `ViewOrientation` to `string`, and add a key-building helper right below the field declarations:

```ts
private readonly layerObjects = new Map<string, TrackedObject[]>();
private readonly wallSegmentsByOrientation = new Map<string, WallSegment[]>();

private layerKey(level: Level, orientation: ViewOrientation): string {
  return `${level}:${orientation}`;
}
```

- [ ] **Step 3: Rewrite `buildOrientationLayers`**

```ts
private buildOrientationLayers(): void {
  for (const level of LEVELS) {
    for (const orientation of ORIENTATIONS) {
      const objects: LayerObject[] = [];
      const rooms = ROOMS.filter((r) => r.level === level);
      const stairs = STAIRCASES.filter((s) => s.level === level);

      for (const room of rooms) objects.push(createRoomFloor(this, room, orientation));
      for (const stair of stairs) objects.push(createStaircaseVisual(this, stair, orientation));

      const wallSegments = createWalls(this, orientation, level);
      objects.push(...wallSegments.map((segment) => segment.graphics));
      objects.push(createDoorDecorations(this, orientation, level));
      for (const room of rooms) {
        const windowGraphics = createWindows(this, room, orientation);
        if (windowGraphics) objects.push(windowGraphics);
      }
      for (const room of rooms) {
        objects.push(...createFurniture(this, room, orientation));
        objects.push(createRoomLabel(this, room, orientation));
      }

      const visible = level === this.activeLevel && orientation === this.cameraController.getOrientation();
      const tracked = objects.map((obj) => {
        obj.setVisible(visible);
        return { obj, baseX: obj.x, baseY: obj.y, baseDepth: obj.depth };
      });

      const key = this.layerKey(level, orientation);
      this.layerObjects.set(key, tracked);
      this.wallSegmentsByOrientation.set(key, wallSegments);
    }
  }
}
```

- [ ] **Step 4: Update every other reader of `layerObjects`/`wallSegmentsByOrientation`**

In `update()`, change:

```ts
updateWallOcclusion(
  this.wallSegmentsByOrientation.get(orientation)!,
  this.player.worldX,
  this.player.worldY,
  orientation,
);
```

to:

```ts
updateWallOcclusion(
  this.wallSegmentsByOrientation.get(this.layerKey(this.activeLevel, orientation))!,
  this.player.worldX,
  this.player.worldY,
  orientation,
);
```

In `updateDuringRotation()`/`applyLayerFold()`, change the `applyLayerFold` signature and both call sites to key by the active level:

```ts
private updateDuringRotation(): void {
  const { from, to, t } = this.cameraController.getTransition();
  const fromScale = 1 - t;
  const toScale = t;
  this.applyLayerFold(this.activeLevel, from, fromScale, fromScale >= toScale);
  this.applyLayerFold(this.activeLevel, to, toScale, toScale > fromScale);
  this.player.blendVisual(from, to, t);
}

private applyLayerFold(level: Level, orientation: ViewOrientation, scaleX: number, onTop: boolean): void {
  for (const { obj, baseX, baseY, baseDepth } of this.layerObjects.get(this.layerKey(level, orientation))!) {
    obj.setScale(scaleX, 1);
    obj.setPosition(this.rotationPivotX * (1 - scaleX) + scaleX * baseX, baseY);
    obj.setDepth(onTop ? baseDepth + FOLD_TOP_DEPTH_BIAS : baseDepth);
  }
}
```

In `handleRotateStart()`, change:

```ts
for (const { obj } of this.layerObjects.get(to)!) obj.setVisible(true);
```

to:

```ts
for (const { obj } of this.layerObjects.get(this.layerKey(this.activeLevel, to))!) obj.setVisible(true);
```

In `handleRotateComplete()`, change:

```ts
private handleRotateComplete(orientation: ViewOrientation): void {
  for (const [layerOrientation, tracked] of this.layerObjects) {
    const visible = layerOrientation === orientation;
    for (const { obj, baseX, baseY, baseDepth } of tracked) {
```

to:

```ts
private handleRotateComplete(orientation: ViewOrientation): void {
  for (const [key, tracked] of this.layerObjects) {
    const visible = key === this.layerKey(this.activeLevel, orientation);
    for (const { obj, baseX, baseY, baseDepth } of tracked) {
```

(the rest of that function body is unchanged).

- [ ] **Step 5: Fix the two remaining `createWorldCollision` call sites (temporary — Task 10 fixes them properly)**

In `create()`, temporarily change:

```ts
const collision = createWorldCollision(this);
```

to:

```ts
const collision = createWorldCollision(this, this.activeLevel);
```

This will be replaced with a two-group setup in Task 10 — it's a minimal stopgap so the file compiles for this task's verification step.

- [ ] **Step 6: Run the type checker**

Run: `npx tsc --noEmit`
Expected: zero errors anywhere in the project.

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev` (background), then use the Playwright browser tools:

```
mcp__plugin_playwright_playwright__browser_navigate to http://localhost:3000
mcp__plugin_playwright_playwright__browser_take_screenshot
```

Expected: a rendered ground floor showing Entrance, Living Room, Kitchen, Cat Room, and the stairwell nook — no hotel rooms, no corridor. Press `R` (via `browser_press_key`) four times and screenshot after each to confirm all 4 orientations render coherently (walls, floor, furniture, labels all rotate together, nothing floats or disappears). Confirm no console errors via `mcp__plugin_playwright_playwright__browser_console_messages`.

- [ ] **Step 8: Commit**

```bash
git add game/scenes/StudioScene.ts
git commit -m "feat: build rendering layers per level, gate visibility on activeLevel"
```

---

### Task 10: StudioScene — per-level collision groups

**Files:**
- Modify: `game/scenes/StudioScene.ts`

**Interfaces:**
- Consumes: `createWorldCollision(scene, level)` and `setGroupEnabled(group, enabled)` from Task 5.
- Produces: `StudioScene`'s collision is now two `StaticGroup`s, one per level, with only the active level's bodies enabled.

- [ ] **Step 1: Update the import**

Change:

```ts
import { createWorldCollision } from "@/game/world/collision";
```

to:

```ts
import { createWorldCollision, setGroupEnabled } from "@/game/world/collision";
```

- [ ] **Step 2: Add a field for the collision groups**

Next to `activeLevel`:

```ts
private readonly collisionGroups = new Map<Level, Phaser.Physics.Arcade.StaticGroup>();
```

- [ ] **Step 3: Build both groups in `create()`, add colliders for both, enable only the active one**

Replace the Task-9 stopgap:

```ts
const collision = createWorldCollision(this, this.activeLevel);
```

```ts
this.physics.add.collider(this.player.sprite, collision);
```

with:

```ts
for (const level of LEVELS) {
  const group = createWorldCollision(this, level);
  setGroupEnabled(group, level === this.activeLevel);
  this.collisionGroups.set(level, group);
  this.physics.add.collider(this.player.sprite, group);
}
```

(this replaces both the `const collision = ...` line and the single `this.physics.add.collider(this.player.sprite, collision);` line — the player now collides against both groups, but only the active level's bodies are enabled, so only they ever actually block her).

- [ ] **Step 4: Run the type checker**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Verify in the browser**

With `npm run dev` still running, use Playwright:

- `browser_navigate` to `http://localhost:3000`.
- Use `browser_press_key` to walk into a wall (e.g. hold/press movement keys toward the Living Room's east wall) and confirm Mimi stops at the wall, doesn't pass through — screenshot before/after.
- Walk into a solid furniture piece (e.g. the Living Room sofa) and confirm she's blocked.
- Confirm no console errors.

- [ ] **Step 6: Commit**

```bash
git add game/scenes/StudioScene.ts
git commit -m "feat: build collision per level, only the active level blocks movement"
```

---

### Task 11: StudioScene — per-level interaction systems

**Files:**
- Modify: `game/scenes/StudioScene.ts`

**Interfaces:**
- Consumes: `roomAt` from Task 1; unmodified `InteractionSystem`, `InteractionPrompt`, `INTERACTABLES`.
- Produces: `StudioScene` now owns one `InteractionSystem`/`InteractionPrompt` pair per level; `interact()`, `update()`, `handleEscape()`, and the rotation/prompt-hiding logic all route through whichever pair matches `activeLevel`.

- [ ] **Step 1: Update imports**

Change:

```ts
import { ROOMS, STAIRCASES } from "@/game/world/rooms";
```

to:

```ts
import { ROOMS, STAIRCASES, roomAt } from "@/game/world/rooms";
```

- [ ] **Step 2: Replace the single `interactionSystem`/`interactionPrompt` fields**

Change:

```ts
private interactionSystem!: InteractionSystem;
private interactionPrompt!: InteractionPrompt;
```

to:

```ts
private readonly interactionSystems = new Map<Level, InteractionSystem>();
private readonly interactionPrompts = new Map<Level, InteractionPrompt>();

private get activeInteractionSystem(): InteractionSystem {
  return this.interactionSystems.get(this.activeLevel)!;
}

private get activeInteractionPrompt(): InteractionPrompt {
  return this.interactionPrompts.get(this.activeLevel)!;
}
```

- [ ] **Step 3: Build one pair per level in `create()`**

Replace:

```ts
this.interactionSystem = new InteractionSystem(this, INTERACTABLES);
this.interactionPrompt = new InteractionPrompt(this, this.interactionSystem, this.player);
this.interactionSystem.on(INTERACTION_EVENTS.Open, this.handleInteractionOpen, this);
this.interactionSystem.on(
  INTERACTION_EVENTS.Prompt,
  (interactable: Interactable | null) => this.events.emit(SCENE_EVENTS.InteractionPromptChange, interactable),
  this,
);
```

with:

```ts
for (const level of LEVELS) {
  const levelInteractables = INTERACTABLES.filter((i) => roomAt(i.x, i.y)?.level === level);
  const system = new InteractionSystem(this, levelInteractables);
  const prompt = new InteractionPrompt(this, system, this.player);
  system.on(INTERACTION_EVENTS.Open, this.handleInteractionOpen, this);
  system.on(
    INTERACTION_EVENTS.Prompt,
    (interactable: Interactable | null) => this.events.emit(SCENE_EVENTS.InteractionPromptChange, interactable),
    this,
  );
  if (level !== this.activeLevel) prompt.setHidden(true);
  this.interactionSystems.set(level, system);
  this.interactionPrompts.set(level, prompt);
}
```

- [ ] **Step 4: Route `update()`, `interact()`, and rotation hide/show through the active pair**

In `update()`, change:

```ts
this.interactionSystem.update(this.player.worldX, this.player.worldY);
this.interactionPrompt.update();
```

to:

```ts
this.activeInteractionSystem.update(this.player.worldX, this.player.worldY);
this.activeInteractionPrompt.update();
```

Change the `interact()` method:

```ts
interact(): void {
  this.interactionSystem.interact();
}
```

to:

```ts
interact(): void {
  this.activeInteractionSystem.interact();
}
```

In `handleRotateStart()`, change:

```ts
this.interactionPrompt.setHidden(true);
```

to:

```ts
this.activeInteractionPrompt.setHidden(true);
```

In `handleRotateComplete()`, change:

```ts
this.interactionPrompt.setHidden(false);
```

to:

```ts
this.activeInteractionPrompt.setHidden(false);
```

- [ ] **Step 5: Run the type checker**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Verify in the browser**

With `npm run dev` running, use Playwright:

- Navigate to `http://localhost:3000`.
- Walk to the Entrance's contact spot (near world tile 6,2) and press `E` (`browser_press_key`) — confirm the Contact panel opens (`browser_snapshot` or screenshot).
- Press `Escape`, confirm it closes.
- Walk to the Living Room and open About, then Experience, the same way.
- Confirm no console errors.

- [ ] **Step 7: Commit**

```bash
git add game/scenes/StudioScene.ts
git commit -m "feat: run one interaction system per level, route through the active one"
```

---

### Task 12: StudioScene — staircase trigger and floor transition

**Files:**
- Modify: `game/scenes/StudioScene.ts`

**Interfaces:**
- Consumes: `isOnStaircase` from Task 6, `StaircaseDef` from Task 1.
- Produces: walking onto a staircase's trigger footprint transitions `activeLevel`, moves the player to `toTile`, swaps the active collision group and interaction pair, and re-fades the visible layer — fully automatic, no `[E]` press.

- [ ] **Step 1: Update the import**

Change:

```ts
import { createStaircaseVisual } from "@/game/world/staircase";
```

to:

```ts
import { createStaircaseVisual, isOnStaircase } from "@/game/world/staircase";
```

Also import `TILE_SIZE` (used to convert `toTile` to world pixels) — it isn't currently imported in `StudioScene.ts`, so add it to the existing `@/game/config/world` import:

```ts
import { TILE_SIZE, WORLD_PIXEL_HEIGHT, WORLD_PIXEL_WIDTH } from "@/game/config/world";
```

- [ ] **Step 2: Add the transitioning-flag field**

Next to `inputLocked`:

```ts
private transitioningFloor = false;
```

- [ ] **Step 3: Check for staircase overlap every frame**

In `update()`, after the existing interaction/prompt update calls, add:

```ts
if (!this.transitioningFloor) {
  const stair = STAIRCASES.find(
    (s) => s.level === this.activeLevel && isOnStaircase(s, this.player.worldX, this.player.worldY),
  );
  if (stair) this.beginFloorTransition(stair);
}
```

- [ ] **Step 4: Write `beginFloorTransition`**

Add this new private method:

```ts
private beginFloorTransition(stair: StaircaseDef): void {
  this.transitioningFloor = true;
  this.inputLocked = true;
  this.player.stop();
  this.activeInteractionPrompt.setHidden(true);

  const orientation = this.cameraController.getOrientation();
  const fromLevel = this.activeLevel;
  const toLevel = stair.toLevel;
  const fromObjects = this.layerObjects.get(this.layerKey(fromLevel, orientation))!;
  const toObjects = this.layerObjects.get(this.layerKey(toLevel, orientation))!;

  const fadeOut = { alpha: 1 };
  this.tweens.add({
    targets: fadeOut,
    alpha: 0,
    duration: 250,
    ease: "Sine.easeInOut",
    onUpdate: () => {
      for (const { obj } of fromObjects) obj.setAlpha(fadeOut.alpha);
    },
    onComplete: () => {
      for (const { obj } of fromObjects) {
        obj.setVisible(false);
        obj.setAlpha(1);
      }

      this.activeLevel = toLevel;
      const targetX = stair.toTile.x * TILE_SIZE + TILE_SIZE / 2;
      const targetY = stair.toTile.y * TILE_SIZE + TILE_SIZE / 2;
      this.player.sprite.setPosition(targetX, targetY);
      this.player.reprojectVisual(orientation);

      setGroupEnabled(this.collisionGroups.get(fromLevel)!, false);
      setGroupEnabled(this.collisionGroups.get(toLevel)!, true);

      for (const { obj } of toObjects) {
        obj.setVisible(true);
        obj.setAlpha(0);
      }
      const fadeIn = { alpha: 0 };
      this.tweens.add({
        targets: fadeIn,
        alpha: 1,
        duration: 250,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          for (const { obj } of toObjects) obj.setAlpha(fadeIn.alpha);
        },
        onComplete: () => {
          this.activeInteractionPrompt.setHidden(false);
          this.transitioningFloor = false;
          this.inputLocked = false;
        },
      });
    },
  });
}
```

Add the `StaircaseDef` type import alongside the others from `@/game/types/world`:

```ts
import { LEVELS } from "@/game/types/world";
import type { Level, StaircaseDef } from "@/game/types/world";
```

- [ ] **Step 5: Run the type checker**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Verify in the browser**

With `npm run dev` running, use Playwright:

- Navigate, walk from spawn through the Living Room to the stairwell nook (enters around world tile x51, y10-18, through Living Room's east door), screenshot just before entering it.
- Continue walking into the nook (the whole nook is the trigger — no separate smaller zone), screenshot during/after — confirm the ground floor fades out, the first floor (Bedroom/Study) fades in, and Mimi lands just inside Bedroom (world tile ~32,11) able to move immediately.
- Confirm collision now blocks against first-floor walls (walk into Bedroom's wall) and ground-floor collision no longer applies (nothing to check directly, but movement should feel identical/unblocked in the newly-empty former ground-floor space is moot since she's not there).
- Walk to the first-floor stairwell trigger and confirm she returns to the ground floor, landing back near the ground stairwell.
- Confirm no console errors throughout.

- [ ] **Step 7: Commit**

```bash
git add game/scenes/StudioScene.ts
git commit -m "feat: walking onto a staircase transitions between floors"
```

---

### Task 13: Full validation pass

**Files:** none (verification only).

- [ ] **Step 1: Type check, lint, build**

Run in order:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all three succeed with zero errors/warnings.

- [ ] **Step 2: Full browser walkthrough via Playwright**

With `npm run dev` running (or against the production build from Step 1), drive through every item in the spec's validation checklist, taking a screenshot at each major checkpoint and checking `browser_console_messages` after each for errors:

Ground floor: spawn in Entrance → walk into Living Room → Kitchen → Cat Room (confirm it's empty — floor/walls/door only) → back to Entrance → to the stairwell → onto the staircase.

Upstairs: confirm arrival → walk into Bedroom → Study → back to the stairwell → downstairs → confirm correct return to the ground floor.

Rotation: repeat a short walk (spawn → Living Room) at all 4 orientations (`Q`/`R` via `browser_press_key`), confirming walls/floor/furniture/labels/staircase/collision/occlusion stay coherent at each.

Movement: confirm arrow keys and WASD both move Mimi (send both key sets), confirm diagonal movement, confirm movement resumes correctly immediately after a floor transition and after a camera rotation.

Interactions: open and close (via `E`/Escape) all 7 — Contact (Entrance), About and Experience (Living Room), Quick CV/Projects/Skills (Study), Education (Bedroom) — confirming each opens the correct existing portfolio panel content.

Regression: confirm `Q`/`R` rotation still works, ESC still closes panels, no horizontal scrollbar appears, no console errors at any point in the walkthrough.

- [ ] **Step 3: Report results**

Summarize pass/fail for each checklist item above in the final response — do not claim success on any item not actually exercised via the browser tools in Step 2.

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task — data model (Task 1), config (Task 2), walls (Task 3), corridor removal (Task 4), collision (Task 5), staircase module (Task 6), interactables (Task 7), spawn (Task 8), rendering/collision/interaction/transition wiring (Tasks 9-12), full validation (Task 13).
- **No test framework:** confirmed via `package.json` — this plan intentionally does not introduce one; verification is `tsc`/`lint`/`build` plus Playwright browser walkthroughs, matching the project's own existing validation practice.
- **Type/name consistency checked:** `Level`/`LEVELS`, `StaircaseDef`, `roomAt`, `createStaircaseVisual`/`isOnStaircase`, `setGroupEnabled`, `layerKey`, `activeInteractionSystem`/`activeInteractionPrompt` are each defined exactly once and referenced with matching names and signatures everywhere they're used in later tasks.
- **Geometry cross-checked by hand:** every shared wall line between adjacent rooms/staircase nooks (Entrance↔Living Room, Living Room↔Kitchen, Living Room↔Cat Room, Living Room↔ground stairwell, Bedroom↔first-floor stairwell, Study↔first-floor stairwell) resolves to identical world-pixel coordinates on both sides, and both staircases' `toTile` arrival points fall inside the target nook and clear of that nook's own trigger footprint.
