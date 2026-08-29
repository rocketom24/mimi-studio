import { TILE_SIZE } from "@/game/config/world";
import { ROOMS } from "@/game/world/rooms";
import type { Interactable } from "@/game/types/interaction";
import type { Level } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;

const INTERACTION_RADIUS = 14;

/** World-pixel center of a tile at (localTileX, localTileY) within a room, plus that room's level — the only reliable source of an interactable's level (see the `level` doc comment on `Interactable`). */
function roomPoint(roomId: string, localTileX: number, localTileY: number): { x: number; y: number; level: Level } {
  const room = ROOMS.find((r) => r.id === roomId);
  if (!room) throw new Error(`Unknown room id: ${roomId}`);
  return {
    x: px(room.tiles.x + localTileX) + TILE_SIZE / 2,
    y: px(room.tiles.y + localTileY) + TILE_SIZE / 2,
    level: room.level,
  };
}

/** Every interactable object in the studio. Positions derive from ROOMS so they never drift from the drawn layout. */
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
