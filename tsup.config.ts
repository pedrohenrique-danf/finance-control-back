import { defineConfig } from "tsup";

export default defineConfig({
  // migrate: aplica as migrações antes do servidor (script start).
  entry: { main: "src/main.ts", migrate: "src/db/migrate.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
});
