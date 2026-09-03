import fs from "node:fs";
import path from "node:path";

const FURNITURE_DIR = path.join(process.cwd(), "public", "furniture");

/**
 * Server-only: lists every PNG in public/furniture/ so the (dev-only)
 * furniture editor sidebar never needs a hardcoded catalog updated by hand.
 * Only import this from a Server Component (e.g. app/page.tsx) — it uses
 * node:fs and will fail to bundle into client code.
 */
export function listFurnitureAssetFiles(): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(FURNITURE_DIR);
  } catch {
    return [];
  }
  return entries.filter((name) => name.toLowerCase().endsWith(".png")).sort();
}
