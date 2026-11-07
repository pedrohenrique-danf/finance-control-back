// Seed idempotente de desenvolvimento — NUNCA em produção.
import { loadConfig } from "@/app/config";
import { createDb } from "@/db/client";

const config = loadConfig();
if (config.env === "production") throw new Error("Seed bloqueado em produção.");

const { close } = createDb(config.databaseUrl);
try {
  // 1) criar usuário de dev via Better Auth (não insira hash manualmente)
  // 2) inserir categorias padrão com onConflictDoNothing
  console.info("Seed: nada a semear ainda (tabelas de domínio não criadas).");
} finally {
  await close();
}
