import { TILE_SIZE } from "@/game/config/world";
import { ROOMS } from "@/game/world/rooms";
import type { Interactable } from "@/game/types/interaction";

const px = (tiles: number) => tiles * TILE_SIZE;

const INTERACTION_RADIUS = 14;

/** World-pixel center of a tile at (localTileX, localTileY) within a room. */
function roomPoint(roomId: string, localTileX: number, localTileY: number): { x: number; y: number } {
  const room = ROOMS.find((r) => r.id === roomId);
  if (!room) throw new Error(`Unknown room id: ${roomId}`);
  return {
    x: px(room.tiles.x + localTileX) + TILE_SIZE / 2,
    y: px(room.tiles.y + localTileY) + TILE_SIZE / 2,
  };
}

/** Every interactable object in the studio. Positions derive from ROOMS so they never drift from the drawn layout. */
export const INTERACTABLES: Interactable[] = [
  {
    id: "contact",
    ...roomPoint("entry", 3, 4),
    radius: INTERACTION_RADIUS,
    prompt: "[E] Contact Mimi",
    panelId: "contact",
  },
  {
    id: "about",
    ...roomPoint("living-room", 5, 8),
    radius: INTERACTION_RADIUS,
    prompt: "[E] About Mimi",
    panelId: "about",
  },
  {
    id: "experience",
    ...roomPoint("office", 4, 6),
    radius: INTERACTION_RADIUS,
    prompt: "[E] View Experience",
    panelId: "experience",
  },
  {
    id: "quick-cv",
    ...roomPoint("office", 8, 6),
    radius: INTERACTION_RADIUS,
    prompt: "[E] Quick CV",
    panelId: "cv",
  },
  {
    id: "projects",
    ...roomPoint("project-room", 4, 7),
    radius: INTERACTION_RADIUS,
    prompt: "[E] View Projects",
    panelId: "projects",
  },
  {
    id: "skills",
    ...roomPoint("workshop", 4, 4),
    radius: INTERACTION_RADIUS,
    prompt: "[E] View Skills",
    panelId: "skills",
  },
  {
    id: "education",
    ...roomPoint("study", 6, 8),
    radius: INTERACTION_RADIUS,
    prompt: "[E] Education",
    panelId: "education",
  },
];
