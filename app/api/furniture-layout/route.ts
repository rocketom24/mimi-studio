import fs from "node:fs/promises";
import path from "node:path";
import { isFurnitureEditorItem } from "@/game/world/furnitureEditorAssets";

const LAYOUT_FILE = path.join(process.cwd(), "game", "data", "furnitureLayout.json");

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
