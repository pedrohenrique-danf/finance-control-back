import { defineConfig } from "drizzle-kit";

// Arquivo de ferramenta: exceção documentada à regra de ler process.env só em env.ts.
try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: variáveis vêm do ambiente (CI/produção)
}

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) throw new Error("Defina DATABASE_URL_DIRECT ou DATABASE_URL para usar o Drizzle Kit.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
