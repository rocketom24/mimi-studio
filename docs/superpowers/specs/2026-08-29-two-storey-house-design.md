# Phase 12 — Two-Storey House Design

## Goal

Replace the current 5×2 hotel-grid layout (10 identical rooms + central corridor) with a believable small two-storey home: 4 rooms on the ground floor, 2 rooms upstairs, connected by a walkable staircase. Preserve every existing system (movement, input, camera rotation, projection, occlusion, interaction, portfolio panels) untouched except where the new layout structurally requires it.

## Why the world stays 512×288 (no expansion)

`toViewSpace()` in `game/world/projection.ts` mirrors the three rotated camera views around the global `WORLD_PIXEL_WIDTH`/`WORLD_PIXEL_HEIGHT` constants. That function is locked (view-space rotation must not be rewritten). If both floors were stacked inside one taller world, rotation would mirror around the *combined* height, which is correct for whichever floor sits at the origin and wrong for the other.

Instead, **both floors occupy the identical 512×288 rectangle**, like two transparencies over the same frame. Only one floor's geometry is visible, collidable, and interactable at a time. World pixel dimensions never change, so every orientation/rotation calculation in `projection.ts` and `cameraController.ts` needs zero changes — this is what keeps rotation math correct for both floors without touching locked code.

## Data model changes

`game/types/world.ts`:

- `RoomDef` gains `level: 0 | 1`. Named `level`, not `floor` — `floorType`/`floorColor` and `game/world/floorSystem.ts` already mean "walkable surface," a different concept from "building storey." Keeps the two ideas from colliding in code and in conversation.
- `DoorSide` extends from `"north" | "south"` to `"north" | "south" | "east" | "west"` — required because Living Room borders Kitchen and Cat Room side-by-side (not just top/bottom), and upstairs rooms connect to the staircase landing from whichever side fits.
- New `StaircaseDef`:
  ```ts
  interface StaircaseDef {
    id: string;
    level: 0 | 1;
    tiles: TileRect;       // the small walkable trigger footprint
    toLevel: 0 | 1;
    toTile: { x: number; y: number }; // arrival point on the other level, clear of that level's own trigger footprint
  }
  ```
  Each staircase is one-directional data (ground→first, first→ground) but visually reads as the same physical staircase since both zones render at connected positions within their own floor's stairwell nook.

`game/world/rooms.ts` stays the single source of truth: exports `ROOMS: RoomDef[]` (now 6 entries across both levels) and a new `STAIRCASES: StaircaseDef[]` (2 entries). The `TOP_Y`/`BOTTOM_Y`/`TOP_H`/`BOTTOM_H` row constants go away — they encoded the hotel's row-pair assumption.

## Room layout

Interior usable tile space stays x:1–62, y:1–34 (62×34 tiles) on each level, independently.

**Ground floor (level 0)**

| Room | Tiles (x, y, w, h) | Notes |
|---|---|---|
| Entrance | 4, 1, 12, 8 | Compact, sits under the front door, offset toward one side rather than centered |
| Living Room | 2, 10, 48, 16 | Largest room by far (768 tiles); entrance nook and stairwell nook both open directly off it |
| Kitchen | 2, 27, 22, 7 | South of Living Room, west side |
| Cat Room | 28, 27, 22, 7 | South of Living Room, east side, empty per requirement 13 |
| Stairwell nook | 51, 10, 8, 8 | Off Living Room's east side; small trigger footprint (≈3×3) sits against its back wall |

A 4-tile gap is left between Kitchen and Cat Room (x24–28) — dead space behind solid walls, not a walkable corridor. It's what keeps the floor plan from reading as a rigid symmetric grid (kitchen and cat room don't touch each other directly, only through Living Room above), matching the "avoid perfectly symmetrical" requirement.

The front door (existing exterior gap in the north wall) moves to align with Entrance's width instead of its old hotel position.

**First floor (level 1)**

| Room | Tiles (x, y, w, h) | Notes |
|---|---|---|
| Bedroom | 2, 6, 32, 22 | |
| Study + Computer | 43, 6, 17, 22 | |
| Stairwell nook | 35, 10, 7, 8 | Between the two rooms, doors open into each |

**Wall/void rule:** any room edge that borders neither another room nor a declared door defaults to a plain solid wall, whether or not it happens to touch the world's outer border. This is what makes leftover dead space (the Kitchen/Cat-Room gap, the margins around each stairwell nook) safe to leave unfilled — it's simply sealed off, never rendered as walkable, and costs nothing extra.

## Wall generation (`game/world/wallSystem.ts`)

`computeWallRects()` currently assumes exactly two equal-height rows of rooms plus a shared corridor (`TOP_Y`/`BOTTOM_Y`). That assumption is replaced with a per-room-edge algorithm, parameterized by `level`:

1. Outer border wall around the full 512×288 rect, with the exterior door gap included only when `level === 0`.
2. For each room on that level, walk its 4 edges. An edge is either:
   - A **declared door** (gap) — from that room's `doors[]`.
   - **Shared with a neighboring room** — drawn once, by convention the room with the smaller `tiles.y` (or, for east/west-adjacent rooms, smaller `tiles.x`) owns and draws that boundary; the neighbor doesn't redraw it. This avoids double walls or mismatched gaps at a shared partition.
   - Otherwise **solid** — including edges facing dead space, per the void rule above.

`createDoorDecorations()` and `createWindows()` take the same `level` filter so their gap/window math only considers the active level's rooms.

`floorSystem.ts`'s `createCorridorFloor()` and `config/world.ts`'s `CORRIDOR_FLOOR_COLOR` are removed — every level's rooms fully tile their own footprint (including the stairwell nooks), so there's no leftover floor to paint a corridor onto. This directly satisfies requirement 15 (no corridor).

## Rendering: two floors × four orientations

`StudioScene.buildOrientationLayers()` currently builds one visual layer per orientation (4 total) for the single global `ROOMS` list, toggling `setVisible` on whichever orientation is active. This extends to build one layer per `(level, orientation)` pair (8 total, still built once up front — same "build once, toggle active" pattern already in place) using `ROOMS.filter(r => r.level === level)` and `STAIRCASES.filter(s => s.level === level)` at each call site into `floorSystem`/`wallSystem`/`furnitureSystem`/`studioWorld`/the new `staircase.ts`. Visibility becomes a two-axis check: `visible = orientation === activeOrientation && level === activeLevel`. None of those four render modules need internal changes beyond an added `level`/room-list filter — their geometry math is already purely per-room.

## Staircase module (`game/world/staircase.ts`, new)

Small, following the existing pattern of `floorSystem.ts`/`wallSystem.ts`: one function to draw a stairwell nook's floor + a simple stepped-block visual (reusing `project`/`toViewRect`, no new projection math), and a plain geometric helper to test whether the player's world position overlaps a `StaircaseDef.tiles` rect. Not part of `InteractionSystem` — the transition is automatic on overlap (walking onto the step), not an `[E]`-press interaction, per requirement 3.

## Floor transition

Checked once per frame in `StudioScene.update()`, alongside the existing occlusion/interaction updates: if the player's world position overlaps the active level's staircase trigger rect and no transition is already running, start one.

Sequence (owned by `StudioScene`, mirroring the existing rotation transition's structure — reuses `inputLocked`, a short tween, and the same camera `setBounds`/`startFollow` reset `handleRotateComplete` already does):

1. Lock input, stop the player (same as rotation/panel-open already do).
2. Short fade/scale tween (~250ms) on the active level's visible layer objects.
3. Flip `activeLevel`; move `player.sprite` (and its physics body, via `setPosition`) to the target staircase's `toTile`.
4. Swap which of two prebuilt collision `StaticGroup`s has its bodies enabled (built once per level at scene creation, same pattern as the layer objects — avoids touching `game/world/collision.ts`'s existing single-group shape beyond adding a `level` filter and building it twice).
5. Swap which of two `InteractionSystem` instances (built once per level from `INTERACTABLES.filter(...)` by the room's level, at scene creation) receives `update()`/`interact()` calls. `InteractionSystem` itself is untouched — this is composition at the call site, not a rewrite. `InteractionPrompt` is similarly re-pointed at whichever instance is active.
6. Fade the new level's layer in, reset camera bounds/follow (bounds are level-independent — both levels share the same world dimensions), unlock input.

No re-trigger cooldown/timer is needed: `toTile` is placed a couple tiles clear of the *other* level's own trigger footprint by construction, so arrival never lands inside a trigger zone.

## Interactables (`game/data/interactables.ts`)

IDs and `panelId`s are unchanged. `roomPoint()` is unchanged (still looks up by room id). Only the room id / local-tile arguments move:

| Interactable | Old room | New room |
|---|---|---|
| contact | entry | entrance |
| about | living-room | living-room |
| experience | office | living-room |
| quick-cv | office | study |
| projects | project-room | study |
| skills | workshop | study |
| education | study | bedroom |

## Player spawn (`game/entities/Player.ts`)

Only the two exported constants (`PLAYER_SPAWN_TILE_X/Y`) change value, to a point inside the new Entrance room. `Player` class logic is untouched.

## File-scope summary

**Modified:**
- `game/types/world.ts` — `level` on `RoomDef`, `DoorSide` gains east/west, new `StaircaseDef`
- `game/world/rooms.ts` — new `ROOMS` (6 entries, 2 levels), new `STAIRCASES`
- `game/config/world.ts` — reposition `EXTERIOR_DOOR`, remove `CORRIDOR_FLOOR_COLOR`
- `game/world/wallSystem.ts` — per-room-edge wall algorithm, level-parameterized
- `game/world/floorSystem.ts` — remove `createCorridorFloor`
- `game/world/collision.ts` — level filter, built twice (once per level)
- `game/world/furnitureSystem.ts`, `game/world/studioWorld.ts` — call sites pass a level-filtered room list (no internal logic change)
- `game/data/interactables.ts` — reposition room references only
- `game/entities/Player.ts` — spawn constants only
- `game/scenes/StudioScene.ts` — level state, doubled layer/collision/interaction bookkeeping, staircase overlap check + transition method

**Created:**
- `game/world/staircase.ts` — stairwell visual + overlap helper

**Untouched:** `game/world/projection.ts`, `game/world/cameraController.ts`, `game/world/occlusionSystem.ts`, `game/world/depth.ts`, `game/interactions/InteractionSystem.ts`, `game/interactions/InteractionPrompt.ts`, `game/input/*`, `game/entities/Player.ts` (logic), portfolio panel / React bridge code.

## Testing

Matches the checklist in the phase brief: spawn → walk every ground-floor room → stairwell → arrive upstairs → walk both upstairs rooms → stairwell → back downstairs, repeated at all four `Q`/`R` orientations, plus a movement/collision/interaction regression pass and `npx tsc --noEmit` / `npm run lint` / `npm run build`.
