/** Cohesive cozy pixel-art palette: warm wood, muted purple, cream, dark plum, soft accents. */
export const PALETTE = {
  wood: 0x8a5a3c,
  cream: 0xf0ead6,
  plumDark: 0x241c33,
  plum: 0x3a2f4d,
  purple: 0x6f5c9e,
  green: 0x6bbf8a,
  blue: 0x4ad0e8,
  metal: 0x8894a3,
} as const;

/** Shift a 0xRRGGBB color's channels by `amount` (-255..255), clamped. */
function shade(color: number, amount: number): number {
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(((color >> 16) & 0xff) + amount);
  const g = clamp(((color >> 8) & 0xff) + amount);
  const b = clamp((color & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
}

export const lighten = (color: number, amount = 32): number => shade(color, amount);
export const darken = (color: number, amount = 32): number => shade(color, -amount);
