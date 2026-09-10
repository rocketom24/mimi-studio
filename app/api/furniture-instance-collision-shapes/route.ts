import fs from "node:fs/promises";
import path from "node:path";
import { isShapeList, type Point } from "@/game/world/collisionShapes";

const SHAPES_FILE = path.join(process.cwd(), "game", "data", "furnitureInstanceCollisionShapes.json");

/** Per-placed-instance collision overrides, keyed by furniture item id — see game/world/furnitureEditor.ts's instanceCollisionShapes. Separate file from furnitureCollisionShapes.json (per-kind defaults) so saving/deleting one instance's override never touches another instance's or a kind's data. */
async function readShapes(): Promise<Record<string, Point[][]>> {
  try {
    const raw = JSON.parse(await fs.readFile(SHAPES_FILE, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function isSaveBody(value: unknown): value is { itemId: string; shapes: Point[][] } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.itemId === "string" && isShapeList(v.shapes);
}

function isDeleteBody(value: unknown): value is { itemId: string } {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).itemId === "string";
}

/**
 * Serializes every read-modify-write against SHAPES_FILE onto one chain, so
 * saving instance A and (moments later, but before A's request finishes)
 * deleting/saving instance B can never race — without this, two requests
 * that both read the file before either writes back would silently lose
 * whichever write lands first, taking that instance's saved override down
 * with it even though nothing about it changed.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Reads the live overrides file straight off disk — see furniture-layout/route.ts's GET for why this replaced a static import. */
export async function GET() {
  const data = await readShapes();
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}

/** Dev-only: upserts one instance's collision override — see FurnitureEditor.saveAllInstanceCollisions(). Reads then rewrites the whole file, but only ever changes the one key its payload names. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Furniture editor is not available in production" }, { status: 403 });
  }

  const body: unknown = await request.json();
  if (!isSaveBody(body)) {
    return Response.json({ error: "Invalid instance collision payload" }, { status: 400 });
  }

  await enqueueWrite(async () => {
    const data = await readShapes();
    data[body.itemId] = body.shapes;
    await fs.writeFile(SHAPES_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  });
  return Response.json({ ok: true });
}

/** Dev-only: removes one instance's saved collision override, reverting it to its kind's shared/legacy footprint on next load — see FurnitureEditor.deleteInstanceCollision(). */
export async function DELETE(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Furniture editor is not available in production" }, { status: 403 });
  }

  const body: unknown = await request.json();
  if (!isDeleteBody(body)) {
    return Response.json({ error: "Invalid instance collision delete payload" }, { status: 400 });
  }

  await enqueueWrite(async () => {
    const data = await readShapes();
    delete data[body.itemId];
    await fs.writeFile(SHAPES_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  });
  return Response.json({ ok: true });
}
