/**
 * Builds Mimi's 8-direction walk atlas from the two raw pose sheets.
 *
 * Run: node scripts/build-mimi-walk-atlas.mjs
 * Out: public/assets/game/character/mimi-walk.png
 *      public/assets/game/character/mimi-walk.json   (metrics the game reads)
 *
 * Why this is an offline step rather than runtime canvas work: the two source
 * sheets are AI-generated pose dumps, not a structured grid. They disagree on
 * scale (sheet 3's figures stand ~222px, sheet 4's ~171px), every cell is
 * alpha-cropped differently, and no cell shares a common anchor. Normalising
 * all of that once, offline, means the game can load a plain uniform-grid
 * spritesheet and set origin(0.5, 1) a single time — no per-frame origin
 * table, no canvas textures, and no chance of per-frame drift.
 *
 * Two invariants make the result jitter-free by construction:
 *   1. Every output frame is the same size, so swapping frames can never
 *      change the sprite's display origin.
 *   2. Each figure is placed so its GROUND ANCHOR (centre between the feet,
 *      on the floor line) lands on the same pixel of every frame — the cell's
 *      bottom-centre. Bbox-centring would instead track the arm swing and
 *      make her twitch sideways as the cycle plays.
 *
 * Because the anchor is the horizontal centre, flipX mirrors about the anchor
 * too, so the mirrored directions (SW/W/NE) stay aligned with the real ones.
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const CHAR_DIR = "public/assets/game/character";
const SHEETS = {
  s3: { file: `${CHAR_DIR}/sheet-3-Photoroom.png`,
        cols: [[37,115],[205,296],[381,463],[547,618],[720,805],[875,967],[1046,1136],[1213,1291]],
        rows: [[14,239],[270,494],[523,749]],
        // Mean bbox height of this sheet's neutral standing cells (r1c1, r1c4,
        // r2c1, r2c5). Used only as the scale reference below.
        standing: 222.5 },
  s4: { file: `${CHAR_DIR}/sheet-4-Photoroom.png`,
        cols: [[64,134],[285,364],[514,602],[737,821],[960,1053],[1186,1281]],
        rows: [[13,185],[213,384],[412,573],[607,761]],
        standing: 170.75 },
  // Front-facing walk sheet. Unlike s3/s4 this one is a purpose-built cycle:
  // every cell is a head-on render at a near-identical height (432-440), so
  // `standing` is just its own neutral cell (r0c1) — normalising that onto
  // REFERENCE_STANDING makes a south frame exactly as tall as every other
  // direction's neutral, which is what keeps Mimi's size fixed as she turns.
  s5: { file: `${CHAR_DIR}/sheet-5.png`,
        cols: [[41,217],[296,476],[556,734],[805,984]],
        rows: [[48,487],[533,968]],
        standing: 438 },
};

/** Scale every sheet onto sheet 3's figure size, so no frame changes Mimi's height. */
const REFERENCE_STANDING = SHEETS.s3.standing;

/**
 * Direction sets, chosen by measuring each cell's face fraction, face offset
 * within the head silhouette (yaw), ankle-band spread and per-foot ground
 * height (gait phase) — see the analysis that produced these picks. Only the
 * five left-of-centre yaws are authored; SW/W/NE are flipX of SE/E/NW at
 * runtime, which is why they are absent here.
 *
 * Order per direction is [neutral, contactA, contactB]. The playable cycle
 * expands that to neutral -> A -> neutral -> B so the gait passes through a
 * feet-together moment once per step, as a real one does.
 *
 * Every pose is a real render. Mirroring one to fake the opposite-leg contact
 * was tried and is wrong even for the head-on views: no cell here is perfectly
 * symmetric, so a flip also flips the body's yaw, and her visible ear and hair
 * parting swapped sides on every single step. Measured as the face's offset
 * within the head silhouette, the flip moved yaw by 0.50 facing south and 1.64
 * facing north, against 0.03 across the east row's three real poses — which is
 * exactly why east/west read as a clean walk and north/south strobed. Pairs
 * below are instead picked so the lifted heel is on opposite feet (dark sole
 * visible on the right in one, the left in the other) while the yaw matches.
 */
const DIRECTIONS = [
  // South comes from sheet 5, which is a real front-facing walk cycle rather
  // than a pose dump, so this is the one direction built from authored frames
  // alone — no mirroring, no borrowing from a turned view. Of its 8 cells only
  // three phases are actually distinct; the rest are near-duplicates of the
  // r1c1 family (four cells all showing left planted / right heel up).
  //
  // Picked by measuring each shoe separately (bottom 13% band, split into
  // x-runs): its ground clearance, its silhouette area — in a head-on render
  // the near foot is the big one, so area is what carries the depth of a
  // stride the camera cannot show directly — and its dark-sole pixel count,
  // which is only nonzero once a heel has left the floor.
  //
  //   r0c1  neutral   both shoes flat (clearance 2/0, sole 0/12), feet together
  //   r1c1  contactA  left flat and planted, right heel fully up (sole 800, the
  //                   sheet's strongest toe-off) — RIGHT leg rear
  //   r0c2  contactB  left shoe 12px clear of the floor and at its smallest
  //                   area, right flat and planted — LEFT leg rear
  //
  // r0c2 is used as the opposite contact instead of a mirror of r1c1 on purpose:
  // it is a real render, so it does not flip body yaw (head offsets are -3.8 and
  // -2.8 — same side), and the arms already swing correctly against the legs.
  // Measured as hand offset from the feet midpoint, r1c1 is (-56, +42) and r0c2
  // is (-43, +50): each pose carries its rear leg's arm forward, which is the
  // opposite-limb swing a real walk has, and it reverses between the two.
  //
  // Stability: torso offsets are 0.4 / -4.2 / -2.9 raw px (0.33 screen px of
  // sway end to end) and heights 438 / 434 / 440 (0.4 screen px of bob, lowest
  // at the weight-bearing contact) — a walk's own weight shift, well under the
  // ~11% squat that made the previous south frames read as dancing. The planted
  // shoe sits within 2 raw px of the same spot in all three, so nothing slides.
  { name: "s",  poses: [["s5", 0, 1], ["s5", 1, 1], ["s5", 0, 2]] },
  { name: "se", poses: [["s3", 2, 0], ["s3", 1, 0], ["s3", 0, 4]] },
  { name: "e",  poses: [["s4", 1, 1], ["s4", 0, 5], ["s3", 0, 7]] },
  // n's neutral must be a genuinely upright standing pose: s4r2c3 looked
  // right but is mid-walk with bent legs, so it normalises to 208px against
  // the other directions' ~223px and Mimi visibly shrank when she turned to
  // face away. Height differences BETWEEN gait phases are the cycle's own bob
  // and are wanted; height differences between DIRECTIONS are not.
  // Back view: all three are straight-away renders with the arms at her sides,
  // so the silhouette stays put and only the legs move. Which foot is lifted
  // was settled by measuring the dark shoe SOLE, which is only visible once a
  // heel leaves the floor: s3r0c5 carries it well right of the feet midpoint
  // (+0.68 over 108 dark px), s3r2c5 well left (-0.42 over 33), so they are a
  // real alternating pair. s3r2c6 looked like the opposite step by eye but has
  // just 6 dark pixels — it is flat-footed, and used as a contact it made the
  // back walk read as a shuffle. (s4r1c4 is the widest back stride in either
  // sheet but its arms are flung straight out and it normalises 14px shorter,
  // so it both bobbed and read as balancing on a beam; s3r1c7's heel is up on
  // the same side as s3r0c5's, and it is turned further than the other two.)
  { name: "n",  poses: [["s3", 1, 4], ["s3", 0, 5], ["s3", 2, 5]] },
  { name: "nw", poses: [["s3", 2, 3], ["s3", 2, 4], ["s3", 1, 3]] },
];

const ALPHA_MIN = 24;
const PAD = 6; // breathing room so no frame touches its cell edge

async function loadSheet(cfg) {
  const { data, info } = await sharp(cfg.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { ...cfg, data, W: info.width, H: info.height, C: info.channels };
}

const alphaAt = (s, x, y) => s.data[(y * s.W + x) * s.C + 3];

/**
 * Alpha bbox of one cell plus its ground anchor.
 *
 * anchorX is the midpoint of the opaque span in the bottom 20% of the figure —
 * i.e. halfway between the feet. That is the point the body actually travels
 * over: at contact the feet straddle it symmetrically, at pass-through they
 * meet on it. The bbox centre is NOT usable here because a swinging arm drags
 * it sideways by several pixels per keyframe.
 *
 * anchorY is the lowest opaque row: the floor the planted foot stands on.
 */
function measure(sheet, row, col) {
  const [cx0, cx1] = sheet.cols[col];
  const [ry0, ry1] = sheet.rows[row];
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = ry0; y <= ry1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      if (alphaAt(sheet, x, y) >= ALPHA_MIN) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`empty cell r${row}c${col} in ${sheet.file}`);
  const height = maxY - minY + 1;

  const footY0 = maxY - Math.round(height * 0.20);
  let fMin = Infinity, fMax = -1;
  for (let y = footY0; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (alphaAt(sheet, x, y) >= 128) {
        if (x < fMin) fMin = x;
        if (x > fMax) fMax = x;
      }
    }
  }
  const anchorX = fMax < 0 ? (minX + maxX) / 2 : (fMin + fMax) / 2;

  return { left: minX, top: minY, width: maxX - minX + 1, height, anchorX, anchorY: maxY };
}

const sheets = Object.fromEntries(
  await Promise.all(Object.entries(SHEETS).map(async ([k, v]) => [k, await loadSheet(v)])),
);

// --- pass 1: measure every selected pose, in normalised (post-scale) units ---
const frames = [];
for (const dir of DIRECTIONS) {
  for (const [sheetKey, row, col, mirror = false] of dir.poses) {
    const sheet = sheets[sheetKey];
    const m = measure(sheet, row, col);
    const scale = REFERENCE_STANDING / sheet.standing;
    const left = (m.anchorX - m.left) * scale;
    const right = (m.left + m.width - 1 - m.anchorX) * scale;
    frames.push({
      dir: dir.name, sheetKey, row, col, mirror, scale, ...m,
      scaledW: m.width * scale,
      scaledH: m.height * scale,
      // Distance from the anchor to each edge, after scaling. A mirrored pose
      // swaps them, and the cell must be sized for where the art really lands.
      leftOfAnchor: mirror ? right : left,
      rightOfAnchor: mirror ? left : right,
      aboveAnchor: (m.anchorY - m.top) * scale,
    });
  }
}

// --- cell size: big enough that every frame fits around its own anchor ---
const halfW = Math.ceil(Math.max(...frames.map((f) => Math.max(f.leftOfAnchor, f.rightOfAnchor))));
const cellW = halfW * 2 + PAD * 2;
const cellH = Math.ceil(Math.max(...frames.map((f) => f.aboveAnchor))) + PAD;

const COLS = 3; // neutral, contactA, contactB
const ROWS = DIRECTIONS.length;

// --- pass 2: composite ---
const composites = [];
for (let i = 0; i < frames.length; i++) {
  const f = frames[i];
  const sheet = sheets[f.sheetKey];
  const outW = Math.max(1, Math.round(f.scaledW));
  const outH = Math.max(1, Math.round(f.scaledH));
  let pipeline = sharp(sheet.file)
    .extract({ left: f.left, top: f.top, width: f.width, height: f.height })
    .resize(outW, outH, { fit: "fill", kernel: "lanczos3" });
  if (f.mirror) pipeline = pipeline.flop();
  const buf = await pipeline.png().toBuffer();

  const cellCol = i % COLS;
  const cellRow = Math.floor(i / COLS);
  // Anchor -> cell bottom-centre. Flipping happens about the crop's centre,
  // so the anchor's offset within the crop mirrors with it.
  const rawAnchorPxX = (f.anchorX - f.left) * f.scale;
  const anchorPxX = f.mirror ? outW - rawAnchorPxX : rawAnchorPxX;
  const anchorPxY = (f.anchorY - f.top) * f.scale;
  composites.push({
    input: buf,
    left: Math.round(cellCol * cellW + cellW / 2 - anchorPxX),
    top: Math.round(cellRow * cellH + (cellH - PAD) - anchorPxY),
  });
}

const outPng = `${CHAR_DIR}/mimi-walk.png`;
await sharp({ create: { width: cellW * COLS, height: cellH * ROWS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(composites)
  .png()
  .toFile(outPng);

// The neutral standing pose's height, in final atlas pixels. Player.ts pins
// its sprite scale to this so Mimi's on-screen size is a fixed property of the
// art and never drifts as poses change.
const neutralHeights = frames.filter((_, i) => i % COLS === 0).map((f) => f.scaledH);
const referenceStandingHeight = Number(
  (neutralHeights.reduce((a, b) => a + b, 0) / neutralHeights.length).toFixed(2),
);

// Emitted as a typed module rather than JSON so the frame size the game loads
// with is literally the frame size this script wrote — a spritesheet has to be
// given its cell dimensions at load time, before any JSON could be parsed, so
// a data file would have to be duplicated by hand into a constant and could
// silently drift the next time the atlas is rebuilt.
const rowsLiteral = DIRECTIONS.map((d, i) => `  ${d.name}: ${i},`).join("\n");
await writeFile(
  "game/entities/mimiWalkAtlas.ts",
  `// GENERATED by scripts/build-mimi-walk-atlas.mjs — do not edit by hand.
// Rebuild with: node scripts/build-mimi-walk-atlas.mjs

/** Atlas row per authored direction. Frame index = row * COLUMNS + poseIndex. */
export const ATLAS_ROW = {
${rowsLiteral}
} as const;

export type AtlasDirection = keyof typeof ATLAS_ROW;

export const MIMI_WALK_ATLAS = {
  key: "mimi-walk",
  path: "/assets/game/character/mimi-walk.png",
  frameWidth: ${cellW},
  frameHeight: ${cellH},
  columns: ${COLS},
  /**
   * Height in atlas px of the neutral standing pose, averaged over the
   * directions. Player pins its sprite scale to this so Mimi's on-screen size
   * is a property of the art, not of whichever frame happens to be showing.
   */
  referenceStandingHeight: ${referenceStandingHeight},
  /**
   * Transparent gap left below the feet inside each cell. The ground anchor is
   * at (frameWidth / 2, frameHeight - padBottom), which is what the sprite's
   * origin must be set to.
   */
  padBottom: ${PAD},
} as const;

/** Pose slot within a direction's row. */
export const POSE = { neutral: 0, contactA: 1, contactB: 2 } as const;
`,
);

console.log(`wrote ${outPng}  ${cellW * COLS}x${cellH * ROWS}  (frame ${cellW}x${cellH}, ${COLS}x${ROWS})`);
console.log("wrote game/entities/mimiWalkAtlas.ts");
console.log(`reference standing height: ${referenceStandingHeight}px`);
for (const f of frames) {
  console.log(`  ${f.dir.padEnd(3)} ${f.sheetKey}r${f.row}c${f.col}${f.mirror ? " (mirrored)" : ""}  src ${f.width}x${f.height} @${f.scale.toFixed(3)}  -> ${Math.round(f.scaledW)}x${Math.round(f.scaledH)}  anchorOff L${f.leftOfAnchor.toFixed(1)} R${f.rightOfAnchor.toFixed(1)}`);
}
