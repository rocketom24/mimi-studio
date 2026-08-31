import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/config/world";
import { darken, lighten, PALETTE } from "@/game/world/palette";
import { visualDepth } from "@/game/world/depth";
import { project } from "@/game/world/projection";
import type { FurnitureKind, RoomDef } from "@/game/types/world";

const px = (tiles: number) => tiles * TILE_SIZE;

type Rect = { x: number; y: number; w: number; h: number };
type Draw = (g: Phaser.GameObjects.Graphics, r: Rect, color: number) => void;

/** Main body + lighter top edge + darker underside — the base every solid piece builds on. */
function box(g: Phaser.GameObjects.Graphics, r: Rect, color: number): void {
  g.fillStyle(color, 1);
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle(lighten(color, 30), 1);
  g.fillRect(r.x, r.y, r.w, 1);
  g.fillStyle(darken(color, 30), 1);
  g.fillRect(r.x, r.y + r.h - 1, r.w, 1);
}

function hLine(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(x, y, w, 1);
}

function vLine(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(x, y, 1, h);
}

const sofa: Draw = (g, r, color) => {
  box(g, r, color);
  hLine(g, r.x + 1, r.y + 1, r.w - 2, darken(color, 40), 0.6); // backrest seam
  const cushions = Math.max(2, Math.round(r.w / 8));
  for (let i = 1; i < cushions; i++) vLine(g, r.x + Math.round((r.w / cushions) * i), r.y + 2, r.h - 3, darken(color, 25), 0.5);
};

const tv: Draw = (g, r, color) => {
  box(g, r, color);
  const screen = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 3 };
  g.fillStyle(PALETTE.blue, 0.5);
  g.fillRect(screen.x, screen.y, screen.w, screen.h);
  g.fillStyle(lighten(PALETTE.blue, 60), 0.7);
  g.fillRect(screen.x + 1, screen.y + 1, 1, 1);
  g.fillStyle(darken(color, 10), 1);
  g.fillRect(r.x + Math.floor(r.w / 2) - 1, r.y + r.h - 1, 2, 1);
};

const coffeeTable: Draw = (g, r, color) => {
  box(g, r, color);
  hLine(g, r.x + 1, r.y + 1, r.w - 2, lighten(color, 20), 0.5);
};

const desk: Draw = (g, r, color) => {
  box(g, r, color);
  hLine(g, r.x + 1, r.y + 1, r.w - 2, lighten(color, 20), 0.5);
  const midY = r.y + Math.round(r.h * 0.6);
  for (let x = r.x + 3; x < r.x + r.w - 2; x += 4) vLine(g, x, midY, r.h - (midY - r.y) - 1, darken(color, 20), 0.5);
};

const computer: Draw = (g, r, color) => {
  g.fillStyle(color, 1);
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle(PALETTE.blue, 0.6);
  g.fillRect(r.x + 1, r.y, Math.max(1, r.w - 2), Math.max(1, r.h - 1));
};

const chair: Draw = (g, r, color) => {
  box(g, r, color);
  hLine(g, r.x + 1, r.y + 1, r.w - 2, darken(color, 30), 0.5); // backrest
};

const displayTable: Draw = (g, r, color) => {
  box(g, r, color);
  hLine(g, r.x + 1, r.y + 1, r.w - 2, lighten(color, 20), 0.5);
  const accents = [PALETTE.blue, PALETTE.green, PALETTE.purple];
  const count = Math.min(3, Math.max(1, Math.floor(r.w / 6)));
  for (let i = 0; i < count; i++) {
    const bx = r.x + 2 + i * Math.floor((r.w - 4) / count);
    g.fillStyle(accents[i % accents.length], 0.85);
    g.fillRect(bx, r.y + 2, 2, 2);
  }
};

const workstation: Draw = (g, r, color) => {
  box(g, r, color);
  g.fillStyle(PALETTE.blue, 0.55);
  g.fillRect(r.x + 1, r.y + 1, r.w - 2, Math.max(1, Math.floor(r.h * 0.5)));
};

const workbench: Draw = (g, r, color) => {
  box(g, r, color);
  hLine(g, r.x + 1, r.y + 1, r.w - 2, lighten(color, 20), 0.5);
  g.fillStyle(PALETTE.metal, 0.8);
  g.fillRect(r.x + 2, r.y + 1, 2, 1);
  g.fillRect(r.x + r.w - 5, r.y + 1, 2, 1);
};

const toolStorage: Draw = (g, r, color) => {
  box(g, r, color);
  const rows = Math.max(1, Math.floor(r.h / 3));
  for (let i = 1; i <= rows; i++) hLine(g, r.x + 1, r.y + i * 3, r.w - 2, darken(color, 20), 0.5);
};

const bookshelf: Draw = (g, r, color) => {
  box(g, r, color);
  vLine(g, r.x + 1, r.y + 1, r.h - 2, darken(color, 25), 0.6);
  vLine(g, r.x + r.w - 2, r.y + 1, r.h - 2, darken(color, 25), 0.6);
  const shelves = Math.max(1, Math.floor(r.h / 4));
  const spineColors = [PALETTE.purple, PALETTE.blue, PALETTE.green, PALETTE.wood];
  for (let s = 0; s < shelves; s++) {
    const shelfY = r.y + 2 + s * 4;
    hLine(g, r.x + 2, shelfY, r.w - 4, darken(color, 20), 0.5);
    for (let x = r.x + 2; x < r.x + r.w - 2; x += 1) {
      g.fillStyle(spineColors[(x + s) % spineColors.length], 0.8);
      g.fillRect(x, shelfY + 1, 1, 2);
    }
  }
};

const books: Draw = (g, r, color) => {
  g.fillStyle(color, 1);
  g.fillRect(r.x, r.y + r.h - 2, r.w, 2);
  g.fillStyle(lighten(color, 30), 0.8);
  g.fillRect(r.x, r.y + r.h - 2, r.w, 1);
};

const console_: Draw = (g, r, color) => {
  box(g, r, color);
  g.fillStyle(PALETTE.blue, 0.7);
  g.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
  g.fillStyle(PALETTE.green, 0.9);
  g.fillRect(r.x + 1, r.y + r.h - 2, 1, 1);
  g.fillStyle(PALETTE.purple, 0.9);
  g.fillRect(r.x + 3, r.y + r.h - 2, 1, 1);
};

const smallTable: Draw = (g, r, color) => {
  box(g, r, color);
  hLine(g, r.x + 1, r.y + 1, r.w - 2, lighten(color, 20), 0.5);
};

const counter: Draw = (g, r, color) => {
  box(g, r, color);
  hLine(g, r.x + 1, r.y + 1, r.w - 2, lighten(color, 30), 0.6);
  for (let x = r.x + 4; x < r.x + r.w - 2; x += 6) vLine(g, x, r.y + 3, r.h - 4, darken(color, 20), 0.4);
};

const fridge: Draw = (g, r, color) => {
  box(g, r, color);
  hLine(g, r.x + 1, r.y + Math.round(r.h * 0.3), r.w - 2, darken(color, 15), 0.6);
  g.fillStyle(darken(color, 40), 0.9);
  g.fillRect(r.x + r.w - 3, r.y + 2, 1, 2);
};

const diningTable: Draw = (g, r, color) => {
  box(g, r, color);
  hLine(g, r.x + 1, r.y + 1, r.w - 2, lighten(color, 25), 0.5);
  g.fillStyle(darken(color, 30), 0.8);
  g.fillRect(r.x, r.y + r.h - 1, 1, 1);
  g.fillRect(r.x + r.w - 1, r.y + r.h - 1, 1, 1);
};

const shower: Draw = (g, r, color) => {
  box(g, r, color);
  vLine(g, r.x + Math.floor(r.w / 2), r.y + 1, r.h - 2, darken(color, 20), 0.6);
  g.fillStyle(lighten(color, 40), 0.35);
  g.fillRect(r.x + 1, r.y + 1, Math.max(1, r.w - 2), 1);
};

const sink: Draw = (g, r, color) => {
  box(g, r, color);
  g.fillStyle(darken(color, 20), 0.7);
  g.fillRect(r.x + 1, r.y + 1, Math.max(1, r.w - 2), Math.max(1, r.h - 2));
  g.fillStyle(PALETTE.metal, 1);
  g.fillRect(r.x + Math.floor(r.w / 2), r.y, 1, 1);
};

const toilet: Draw = (g, r, color) => {
  box(g, r, color);
  const tankW = Math.max(2, Math.floor(r.w * 0.6));
  g.fillStyle(lighten(color, 10), 1);
  g.fillRect(r.x + Math.floor((r.w - tankW) / 2), r.y - 1, tankW, 2);
};

const bed: Draw = (g, r, color) => {
  box(g, r, color);
  const pillowH = Math.max(2, Math.floor(r.h * 0.28));
  g.fillStyle(PALETTE.cream, 0.9);
  g.fillRect(r.x + 1, r.y + 1, r.w - 2, pillowH);
  hLine(g, r.x + 1, r.y + pillowH + 2, r.w - 2, darken(color, 20), 0.5);
};

const nightstand: Draw = (g, r, color) => {
  box(g, r, color);
  hLine(g, r.x + 1, r.y + Math.round(r.h * 0.55), r.w - 2, darken(color, 20), 0.5);
  g.fillStyle(PALETTE.cream, 0.9);
  g.fillRect(r.x + Math.floor(r.w / 2) - 1, r.y - 1, 2, 1);
};

const shelf: Draw = (g, r, color) => {
  box(g, r, color);
  vLine(g, r.x + Math.floor(r.w / 2), r.y + 1, r.h - 2, darken(color, 25), 0.5);
};

/** Flat mat/rug: no bevel, no shadow — it sits flush with the floor. */
const mat: Draw = (g, r, color) => {
  g.fillStyle(color, 0.9);
  g.fillRect(r.x, r.y, r.w, r.h);
  g.lineStyle(1, lighten(color, 25), 0.6);
  g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
};

const DRAW_BY_KIND: Partial<Record<FurnitureKind, Draw>> = {
  sofa,
  tv,
  coffeeTable,
  desk,
  computer,
  chair,
  displayTable,
  workstation,
  workbench,
  toolStorage,
  bookshelf,
  books,
  console: console_,
  smallTable,
  counter,
  fridge,
  diningTable,
  shower,
  sink,
  toilet,
  bed,
  nightstand,
  shelf,
  mat,
};

const FLUSH_KINDS: ReadonlySet<FurnitureKind> = new Set(["mat"]);

/** Riser height (px) per kind — how tall a piece's base reads before its icon face sits on top. Unlisted kinds fall back to 3. */
const EXTRUSION_HEIGHT: Partial<Record<FurnitureKind, number>> = {
  mat: 0,
  books: 0,
  computer: 0,
  console: 2,
  coffeeTable: 3,
  smallTable: 3,
  bed: 3,
  shelf: 4,
  sofa: 4,
  chair: 4,
  displayTable: 4,
  diningTable: 4,
  sink: 4,
  toilet: 4,
  nightstand: 4,
  tv: 6,
  desk: 6,
  workstation: 6,
  workbench: 6,
  counter: 6,
  shower: 8,
  toolStorage: 10,
  bookshelf: 10,
  fridge: 12,
};

/**
 * Real-photo furniture kinds: rendered as a flat top-down-style PNG icon
 * (see public/furniture) instead of a procedural shape, anchored to its
 * floor point with a soft drop shadow. The same icon is used in both camera
 * modes — isometric just places it on the projected floor point rather than
 * reprojecting/shearing the image, a deliberate trade-off for realistic art
 * with no per-mode asset.
 */
const SPRITE_PATH: Partial<Record<FurnitureKind, string>> = {
  catBed: "/furniture/catBed.png",
  foodBowl: "/furniture/foodBowl.png",
  catTree: "/furniture/catTree.png",
  catToy: "/furniture/catToy.png",
  catLitterBox: "/furniture/catLitterBox.png",
};

/** Display width in world px — independent of (and usually larger than) the piece's collision footprint, so e.g. a tall cat tree can read at full size without blocking more floor than it should. */
const SPRITE_DISPLAY_WIDTH: Partial<Record<FurnitureKind, number>> = {
  catBed: px(2.2),
  foodBowl: px(1.3),
  catTree: px(2.0),
  catToy: px(0.6),
  catLitterBox: px(1.6),
};

function spriteTextureKey(kind: FurnitureKind): string {
  return `furniture-${kind}`;
}

/** Loads every sprite-backed furniture kind's texture. Call once from the scene's preload(). */
export function preloadFurnitureSprites(scene: Phaser.Scene): void {
  for (const kind of Object.keys(SPRITE_PATH) as FurnitureKind[]) {
    scene.load.image(spriteTextureKey(kind), SPRITE_PATH[kind]!);
  }
}

/** Soft flattened drop shadow beneath a sprite piece, at its floor anchor. */
function drawSpriteShadow(g: Phaser.GameObjects.Graphics, anchor: { x: number; y: number }, w: number): void {
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(anchor.x, anchor.y - 1, w * 0.8, Math.max(2, w * 0.22));
}

/** A sprite-backed piece: drop shadow + the real PNG icon, anchored bottom-center at the footprint's floor point and scaled to SPRITE_DISPLAY_WIDTH keeping its natural aspect ratio. */
function createSpritePiece(
  scene: Phaser.Scene,
  worldX: number,
  worldY: number,
  w: number,
  h: number,
  kind: FurnitureKind,
): (Phaser.GameObjects.Graphics | Phaser.GameObjects.Image)[] {
  const anchor = project(worldX + w / 2, worldY + h);
  const depth = visualDepth(worldY + h);

  const shadow = scene.add.graphics().setDepth(depth);
  drawSpriteShadow(shadow, anchor, w);

  const image = scene.add.image(anchor.x, anchor.y, spriteTextureKey(kind)).setOrigin(0.5, 1).setDepth(depth + 0.1);
  const naturalW = image.width || 1;
  const naturalH = image.height || 1;
  const displayWidth = SPRITE_DISPLAY_WIDTH[kind] ?? w;
  image.setDisplaySize(displayWidth, displayWidth * (naturalH / naturalW));

  return [shadow, image];
}

/**
 * Riser: the piece's physical height off the floor, drawn as a flat extruded
 * block (front face + east-edge sliver) between the floor plate and the
 * existing per-kind icon, which sits on top of it. Gives every piece a real
 * base instead of reading as a flat sprite glued to the floor.
 */
function drawRiser(g: Phaser.GameObjects.Graphics, topLeft: { x: number; y: number }, w: number, heightPx: number, color: number): void {
  if (heightPx <= 0) return;
  g.fillStyle(darken(color, 12), 1);
  g.fillRect(topLeft.x, topLeft.y, w, heightPx);
  g.fillStyle(darken(color, 32), 0.85);
  g.fillRect(topLeft.x + w - 2, topLeft.y, 2, heightPx);
  g.fillStyle(lighten(color, 20), 0.8);
  g.fillRect(topLeft.x, topLeft.y, w, 1);
}

/**
 * Draws every piece of furniture in a room: floor shadow, a riser for real
 * height, then the recognizable icon face on top.
 */
export function createFurniture(scene: Phaser.Scene, room: RoomDef): Phaser.GameObjects.GameObject[] {
  const created: Phaser.GameObjects.GameObject[] = [];
  for (const piece of room.furniture) {
    const worldX = px(room.tiles.x + piece.x);
    const worldY = px(room.tiles.y + piece.y);
    const w = px(piece.w);
    const h = px(piece.h);

    if (piece.kind && SPRITE_PATH[piece.kind]) {
      created.push(...createSpritePiece(scene, worldX, worldY, w, h, piece.kind));
      continue;
    }

    const flush = piece.kind ? FLUSH_KINDS.has(piece.kind) : false;
    const heightPx = piece.kind ? (EXTRUSION_HEIGHT[piece.kind] ?? 3) : 3;

    const g = scene.add.graphics().setDepth(visualDepth(worldY + h));

    if (!flush) {
      const shadowAnchor = project(worldX, worldY + h);
      g.fillStyle(0x000000, 0.22);
      g.fillRect(shadowAnchor.x + 1, shadowAnchor.y - 1, Math.max(1, w - 2), 2);
    }

    const riserTop = project(worldX, worldY + h, heightPx);
    drawRiser(g, riserTop, w, heightPx, piece.color);

    const iconRect: Rect = { x: riserTop.x, y: riserTop.y - h, w, h };
    const draw = piece.kind ? DRAW_BY_KIND[piece.kind] : undefined;
    if (draw) draw(g, iconRect, piece.color);
    else box(g, iconRect, piece.color);

    created.push(g);
  }
  return created;
}
