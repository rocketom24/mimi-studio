import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirrors the "@/*" path mapping in tsconfig.json. Without it any module under
// test that imports through the alias (game/world/projection.ts, and anything
// reaching it) fails to resolve under vitest, which has no knowledge of
// tsconfig paths.
const projectRoot = fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]+$/, "");

export default defineConfig({
  resolve: {
    alias: { "@": projectRoot },
  },
});
