import type { PixelRect } from "@/game/types/world";

export interface KeyedRect {
  /** Grouping key — same key + matching (x, w) on consecutive rows means "same wall/room line", eligible to merge. */
  key: string;
  rect: PixelRect;
}

/**
 * Second merge pass for a grid-to-rect conversion whose first pass only
 * merged horizontal runs within a row. Stacks consecutive same-(key, x, w)
 * one-row-tall rects vertically into a single taller rect — turns a vertical
 * wall/room line that would otherwise draw as one block per tile-row into
 * one continuous rect, matching the horizontal case.
 */
export function mergeVerticalRuns(items: KeyedRect[]): KeyedRect[] {
  const groups = new Map<string, KeyedRect[]>();
  for (const item of items) {
    const groupKey = `${item.key}:${item.rect.x}:${item.rect.w}`;
    const list = groups.get(groupKey);
    if (list) list.push(item);
    else groups.set(groupKey, [item]);
  }

  const merged: KeyedRect[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.rect.y - b.rect.y);
    let current: KeyedRect | null = null;
    for (const item of list) {
      if (current && item.rect.y === current.rect.y + current.rect.h) {
        current.rect.h += item.rect.h;
      } else {
        if (current) merged.push(current);
        current = { key: item.key, rect: { ...item.rect } };
      }
    }
    if (current) merged.push(current);
  }
  return merged;
}
