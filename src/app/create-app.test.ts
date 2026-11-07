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
