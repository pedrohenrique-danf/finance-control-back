// ÚNICO ponto de entrada: único módulo com efeitos colaterais (sobe o servidor).
import { serve } from "@hono/node-server";
import { loadConfig } from "@/app/config";
import { createApp } from "@/app/create-app";
import { createHonoServer } from "@/app/http/hono-adapter";

const app = createApp(loadConfig());
const server = serve({ fetch: createHonoServer(app).fetch, port: app.config.port }, (info) => {
  app.logger.info("server_started", { port: info.port, env: app.config.env });
});

function shutdown(signal: string) {
  app.logger.info("server_stopping", { signal });
  server.close(async () => {
    await app.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
