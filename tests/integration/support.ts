import { inArray } from "drizzle-orm";
import { loadConfig } from "@/app/config";
import { type App, createApp } from "@/app/create-app";
import { createHonoServer } from "@/app/http/hono-adapter";
import { createDb } from "@/db/client";
import { users } from "@/db/schema";

// Integração: banco REAL (branch Neon de homologação do .env), nunca produção (docs/05).
try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: usa as variáveis do ambiente (CI)
}

export function setupIntegration() {
  const config = loadConfig();
  if (config.env === "production") throw new Error("Testes de integração bloqueados em produção.");
  const { db, close } = createDb(config.databaseUrl);
  const app: App = createApp({ ...config, logLevel: "error" }, { db });
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
    return { id: body.user.id, api: client(cookie) };
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

  return { app, db, signUp, teardown };
}

export type ApiClient = Awaited<ReturnType<ReturnType<typeof setupIntegration>["signUp"]>>["api"];
