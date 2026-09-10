import fs from "node:fs/promises";
import path from "node:path";
import { isFurnitureEditorItem } from "@/game/world/furnitureEditorAssets";

const LAYOUT_FILE = path.join(process.cwd(), "game", "data", "furnitureLayout.json");

/**
 * Reads the live layout file straight off disk on every request — the
 * single source of truth, in dev AND production, now that furnitureEditor.ts
 * no longer statically `import`s this JSON (a static import made every dev
 * Save look like a source-code change to Turbopack, forcing a full page
 * reload that wiped whatever editor panel was open — see StudioScene load()).
 */
export async function GET() {
  const raw = await fs.readFile(LAYOUT_FILE, "utf8");
  return new Response(raw, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

/** Dev-only: persists the furniture editor's current layout as the project's default. See game/world/furnitureEditor.ts save(). */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Furniture editor is not available in production" }, { status: 403 });
  }

  const body: unknown = await request.json();
  if (!Array.isArray(body) || !body.every(isFurnitureEditorItem)) {
    return Response.json({ error: "Invalid furniture layout payload" }, { status: 400 });
  }

  await fs.writeFile(LAYOUT_FILE, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return Response.json({ ok: true });
}
