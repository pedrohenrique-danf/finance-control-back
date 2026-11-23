// Aplica as migrações pendentes de drizzle/ antes de o servidor subir (script `start`, usado pelo Render).
// Idempotente: migrações já registradas em drizzle.__drizzle_migrations são puladas. Se uma falhar, o processo
// sai com erro e o servidor não sobe, então o deploy anterior continua no ar.
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadConfig } from "@/app/config";

const config = loadConfig();
// Conexão direta (sem pooler) quando houver: é a recomendada pelo Neon para migrações.
const pool = new Pool({ connectionString: config.databaseUrlDirect ?? config.databaseUrl, max: 1 });
const migrationsFolder = resolve(process.cwd(), "drizzle"); // pnpm start roda na raiz do projeto

try {
  const startedAt = Date.now();
  await migrate(drizzle({ client: pool }), { migrationsFolder });
  console.info(JSON.stringify({ level: "info", msg: "migrations_applied", ms: Date.now() - startedAt }));
} catch (error) {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "migrations_failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
