import fs from "node:fs/promises";
import path from "node:path";
import { isCollisionShapeMap } from "@/game/world/collisionShapes";

const SHAPES_FILE = path.join(process.cwd(), "game", "data", "furnitureCollisionShapes.json");

/** Reads the live shapes file straight off disk — see furniture-layout/route.ts's GET for why this replaced a static import. */
export async function GET() {
  const raw = await fs.readFile(SHAPES_FILE, "utf8");
  return new Response(raw, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

/** Dev-only: persists the furniture editor's hand-drawn collision shapes as the project's default. See game/world/furnitureEditor.ts save(). */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Furniture editor is not available in production" }, { status: 403 });
  }

  const body: unknown = await request.json();
  if (!isCollisionShapeMap(body)) {
    return Response.json({ error: "Invalid collision shape payload" }, { status: 400 });
  }

  await fs.writeFile(SHAPES_FILE, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return Response.json({ ok: true });
}
