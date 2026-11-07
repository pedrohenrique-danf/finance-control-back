import { Hono } from "hono";
import { cors } from "hono/cors";
import type { App } from "@/app/create-app";

/** Adaptador do framework HTTP (Hono): registra as rotas agnósticas definidas em createApp. */
export function createHonoServer(app: App): Hono {
  const hono = new Hono();

  if (app.config.corsOrigins.length > 0) {
    hono.use(
      "/api/*",
      cors({
        origin: app.config.corsOrigins,
        credentials: true,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type"],
        exposeHeaders: ["Location", "X-Request-Id"],
      }),
    );
  }

  hono.on(["GET", "POST"], "/api/auth/*", (c) => app.authHandler(c.req.raw));

  for (const route of app.routes) {
    hono.on(route.method, route.path, (c) => app.dispatch(route, c.req.raw, c.req.param()));
  }

  hono.notFound(() => app.notFound());
  hono.onError((error) => app.onError(error));
  return hono;
}
