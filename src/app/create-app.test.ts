import { describe, expect, it } from "vitest";
import type { AppConfig } from "@/app/config";
import type { Database } from "@/db/client";
import type { Auth } from "@/modules/auth";
import { createApp } from "./create-app";
import { createHonoServer } from "./http/hono-adapter";
import { json } from "./http/responses";
import type { RouteDefinition } from "./http/types";

const testConfig: AppConfig = {
  env: "test",
  port: 0,
  databaseUrl: "postgresql://u:p@localhost/test",
  databaseUrlDirect: undefined,
  betterAuthSecret: "x".repeat(32),
  betterAuthUrl: "http://localhost:3001",
  google: undefined,
  mail: undefined,
  corsOrigins: [],
  logLevel: "error",
};

const fakeDb = {} as unknown as Database;
const fakeAuth = (user: { id: string; email: string; name: string } | null) =>
  ({
    api: { getSession: async () => (user ? { user, session: {} } : null) },
    handler: async () => new Response(null, { status: 404 }),
  }) as unknown as Auth;

const privateRoute: RouteDefinition = {
  method: "GET",
  path: "/api/v1/private",
  access: "private",
  handler: async (_req, ctx) => json({ userId: ctx.user?.id }),
};

describe("createApp", () => {
  it("responde à rota de saúde", async () => {
    const server = createHonoServer(createApp(testConfig, { db: fakeDb, auth: fakeAuth(null) }));
    const res = await server.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("retorna 404 no envelope padrão para rota inexistente", async () => {
    const server = createHonoServer(createApp(testConfig, { db: fakeDb, auth: fakeAuth(null) }));
    const res = await server.request("/api/v1/nao-existe");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("rejeita rota privada sem sessão com 401", async () => {
    const app = createApp(testConfig, { db: fakeDb, auth: fakeAuth(null) });
    const res = await app.dispatch(privateRoute, new Request("http://localhost/api/v1/private"), {});
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("injeta o usuário da sessão no contexto da requisição", async () => {
    const app = createApp(testConfig, { db: fakeDb, auth: fakeAuth({ id: "u1", email: "a@b.com", name: "A" }) });
    const res = await app.dispatch(privateRoute, new Request("http://localhost/api/v1/private"), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "u1" });
  });
});

describe("rotas de domínio (sem banco)", () => {
  const anonymous = createApp(testConfig, { db: fakeDb, auth: fakeAuth(null) });
  const signedIn = createHonoServer(
    createApp(testConfig, { db: fakeDb, auth: fakeAuth({ id: "u1", email: "a@b.com", name: "A" }) }),
  );

  it("negar por padrão: só health é pública", () => {
    expect(anonymous.routes.filter((r) => r.access === "public").map((r) => r.path)).toEqual(["/api/v1/health"]);
  });

  it.each(anonymous.routes.filter((r) => r.access === "private"))(
    "$method $path retorna 401 sem sessão",
    async (route) => {
      const res = await anonymous.dispatch(
        route,
        new Request(`http://localhost${route.path}`, { method: route.method }),
        {},
      );
      expect(res.status).toBe(401);
    },
  );

  it.each([
    ["GET", "/api/v1/categories/abc"],
    ["GET", "/api/v1/value-sources/abc"],
    ["DELETE", "/api/v1/transactions/abc"],
    ["GET", "/api/v1/recurrences/abc"],
  ])("%s %s com id inválido → 400 (não 404)", async (method, path) => {
    const res = await signedIn.request(path, { method });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("valida o corpo antes de acessar o banco (campo desconhecido, JSON inválido)", async () => {
    const post = (body: string) =>
      signedIn.request("/api/v1/categories", { method: "POST", body, headers: { "Content-Type": "application/json" } });
    const unknownField = await post(JSON.stringify({ name: "A", type: "despesa", color: "#000000", userId: "x" }));
    expect(unknownField.status).toBe(400);
    expect((await post("{")).status).toBe(400);
  });

  it("preferência de notificação: tipo desconhecido e corpo inválido → 400", async () => {
    const put = (type: string, body: unknown) =>
      signedIn.request(`/api/v1/notification-preferences/${type}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
    expect((await put("lembrete_registro", { active: false })).status).toBe(400);
    expect((await put("categoria_criada", { active: "sim" })).status).toBe(400);
    expect((await put("categoria_criada", { active: true, channel: "email" })).status).toBe(400);
  });

  it("valida a query do extrato e do resumo", async () => {
    expect((await signedIn.request("/api/v1/transactions")).status).toBe(400);
    expect((await signedIn.request("/api/v1/dashboard/summary?month=2026-13")).status).toBe(400);
    expect((await signedIn.request("/api/v1/exports/transactions?month=2026-11&format=xlsx")).status).toBe(400);
  });
});
