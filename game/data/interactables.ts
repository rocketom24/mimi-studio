import type { Interactable } from "@/game/types/interaction";

const INTERACTION_RADIUS = 14;

/**
 * Every interactable object in the studio, one entry per real furniture
 * instance in game/data/furnitureLayout.json. Positions are that instance's
 * own anchor point nudged a few px clear of its collision footprint (see
 * MEASURED_FOOTPRINTS in game/world/furnitureEditor.ts) onto open floor, so
 * Mimi can actually stand within INTERACTION_RADIUS of it — verified live
 * against furnitureEditor.footprintPolygons() and by walking to each one.
 * Two furniture instances mapping to the same panelId (tv+sofa3, almari4+
 * dressingtable) both open the same section, per the portfolio mapping.
 */
export const INTERACTABLES: Interactable[] = [
  // tv (living room, against west wall) -> Experience
  {
    id: "tv",
    x: 49,
    y: 155,
    radius: INTERACTION_RADIUS,
    panelId: "experience",
  },
  // sofa3 (living room) -> Experience
  {
    id: "sofa",
    x: 102,
    y: 173,
    radius: INTERACTION_RADIUS,
    panelId: "experience",
  },
  // kitchen counter (living room, north-west corner) -> About Me
  {
    id: "kitchen",
    x: 51,
    y: 69,
    radius: INTERACTION_RADIUS,
    panelId: "about",
  },
  // Bookshelf1 (bedroom-study) -> Education
  {
    id: "bookshelf",
    x: 268,
    y: 50,
    radius: INTERACTION_RADIUS,
    panelId: "education",
  },
  // Etable (entrance console/cabinet) -> Contact Me
  {
    id: "cabinet",
    x: 144,
    y: 288,
    radius: INTERACTION_RADIUS,
    panelId: "contact",
  },
  // Entrance doorway zone (no distinct phone sprite in the asset set) -> Contact Me
  {
    id: "entrance-phone",
    x: 184,
    y: 264,
    radius: INTERACTION_RADIUS,
    panelId: "contact",
  },
  // dressingtable (bedroom-study) -> Quick CV
  {
    id: "dressing-table",
    x: 264,
    y: 188,
    radius: INTERACTION_RADIUS,
    panelId: "cv",
  },
  // almari4 (bedroom-study) -> Quick CV
  {
    id: "almari",
    x: 264,
    y: 215,
    radius: INTERACTION_RADIUS,
    panelId: "cv",
  },
  // dining (living room) -> Tech Stack
  {
    id: "dining-table",
    x: 148,
    y: 96,
    radius: INTERACTION_RADIUS,
    panelId: "techStack",
  },
  // pc (bedroom-study) -> Projects
  {
    id: "pc",
    x: 350,
    y: 58,
    radius: INTERACTION_RADIUS,
    panelId: "projects",
  },
  // bed (bedroom-study, against east wall) -> Skills
  {
    id: "bed",
    x: 364,
    y: 238,
    radius: INTERACTION_RADIUS,
    panelId: "skills",
  },
  // garden-sofa (garden) -> Currently Learning
  {
    id: "garden",
    x: 357,
    y: 304,
    radius: INTERACTION_RADIUS,
    panelId: "currentlyLearning",
  },
];
