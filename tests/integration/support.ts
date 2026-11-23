import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { inArray } from "drizzle-orm";
import { loadConfig } from "@/app/config";
import { type App, createApp } from "@/app/create-app";
import { createHonoServer } from "@/app/http/hono-adapter";
import { createDb } from "@/db/client";
import { users } from "@/db/schema";
import type { MailMessage } from "@/shared/mailer";

// Integração: banco REAL e exclusivo de testes (branch Neon `teste`, via .env.test). Nunca o .env de
// desenvolvimento nem produção (docs/05). Na CI não há arquivo: as variáveis vêm do ambiente.
try {
  process.loadEnvFile(".env.test");
} catch {
  if (!process.env.CI) {
    throw new Error("Crie o .env.test a partir do .env.test.example (banco da branch Neon `teste`).");
  }
}

/** Host do banco (sem usuário/senha), para comparar connection strings. */
function dbHost(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).hostname.replace("-pooler", "") : undefined;
  } catch {
    return undefined;
  }
}

/** Trava contra colar a connection string errada: o banco de teste não pode ser o do .env de desenvolvimento. */
function assertTestDatabase(databaseUrl: string, env: string) {
  if (env !== "test") {
    throw new Error(`Testes de integração exigem NODE_ENV=test (recebido: ${env}).`);
  }
  if (!existsSync(".env")) return;
  const dev = parseEnv(readFileSync(".env", "utf8"));
  const devHosts = [dbHost(dev.DATABASE_URL), dbHost(dev.DATABASE_URL_DIRECT)];
  if (devHosts.includes(dbHost(databaseUrl))) {
    throw new Error("O .env.test aponta para o mesmo banco do .env. Use a connection string da branch `teste`.");
  }
}

export function setupIntegration() {
  const config = loadConfig();
  assertTestDatabase(config.databaseUrl, config.env);
  const { db, close } = createDb(config.databaseUrl);
  // E-mails ficam numa caixa de saída em memória (nada é enviado de verdade).
  const outbox: MailMessage[] = [];
  const mailer = { send: async (message: MailMessage) => void outbox.push(message) };
  const app: App = createApp({ ...config, logLevel: "error" }, { db, mailer });
  const server = createHonoServer(app);
  const created: string[] = [];

  /** Usuário novo (e-mail único) pelo Better Auth; devolve um cliente HTTP com o cookie de sessão. */
  async function signUp(name = "Teste Integração") {
    const email = `it+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@financecontrol.local`;
    const res = await server.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: config.betterAuthUrl },
      body: JSON.stringify({ name, email, password: "Senha-Integracao-2026!" }),
    });
    if (res.status !== 200) throw new Error(`cadastro falhou: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { user: { id: string } };
    created.push(body.user.id);
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    return { id: body.user.id, email, cookie, api: client(cookie) };
  }

  function client(cookie: string) {
    async function call(method: string, path: string, body?: unknown) {
      const res = await server.request(path, {
        method,
        headers: { cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await res.text();
      const type = res.headers.get("Content-Type") ?? "";
      // biome-ignore lint/suspicious/noExplicitAny: corpo dinâmico nas asserções dos testes
      const data: any = type.includes("json") && text ? JSON.parse(text) : text;
      return { status: res.status, headers: res.headers, data };
    }
    return {
      get: (path: string) => call("GET", path),
      post: (path: string, body: unknown) => call("POST", path, body),
      put: (path: string, body: unknown) => call("PUT", path, body),
      delete: (path: string) => call("DELETE", path),
    };
  }

  async function teardown() {
    if (created.length) await db.delete(users).where(inArray(users.id, created)); // cascata apaga os dados
    await close();
  }

  return { app, config, server, outbox, client, signUp, teardown, db };
}

export type ApiClient = Awaited<ReturnType<ReturnType<typeof setupIntegration>["signUp"]>>["api"];
