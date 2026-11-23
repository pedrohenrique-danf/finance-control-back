// Apaga os usuários criados pelos testes automatizados (e-mails e2e+…@ e it+…@financecontrol.local).
// A exclusão em cascata leva junto categorias, contas, transações, recorrências, notificações e sessões.
// Uso: pnpm db:limpar-testes (banco do .env) | pnpm db:limpar-testes:test (banco do .env.test).
// --simular só conta. Em produção exige --producao (ex.: tsx --env-file=.env.production … --producao).
import { inArray, like, or } from "drizzle-orm";
import { loadConfig } from "@/app/config";
import { createDb } from "@/db/client";
import { users } from "@/db/schema";
import { isTestEmail, TEST_EMAIL_PATTERNS } from "@/db/test-users";

const args = new Set(process.argv.slice(2));
const config = loadConfig();
if (config.env === "production" && !args.has("--producao")) {
  throw new Error("Banco de produção: confirme com --producao (e rode antes com --simular para conferir).");
}

const { db, close } = createDb(config.databaseUrl);
try {
  const matches = or(...TEST_EMAIL_PATTERNS.map((pattern) => like(users.email, pattern)));
  const found = await db.select({ id: users.id, email: users.email }).from(users).where(matches);
  const ids = found.filter((u) => isTestEmail(u.email)).map((u) => u.id);

  if (args.has("--simular")) {
    console.info(`Simulação: ${ids.length} usuário(s) de teste seriam apagados (${config.env}).`);
  } else if (ids.length === 0) {
    console.info("Nenhum usuário de teste para apagar.");
  } else {
    for (let i = 0; i < ids.length; i += 500) {
      await db.delete(users).where(inArray(users.id, ids.slice(i, i + 500)));
    }
    console.info(`${ids.length} usuário(s) de teste apagados, com os dados deles (${config.env}).`);
  }
} finally {
  await close();
}
