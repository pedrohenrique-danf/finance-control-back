import type { AppConfig } from "@/app/config";
import { healthRoute } from "@/app/http/health";
import { toErrorResponse } from "@/app/http/responses";
import type { RequestContext, RouteDefinition } from "@/app/http/types";
import { createDb, type Database } from "@/db/client";
import { type Auth, createAuth, resolveUser } from "@/modules/auth";
import { NotFoundError, UnauthenticatedError } from "@/shared/errors";
import { createConsoleLogger, type Logger } from "@/shared/logger";

export interface AppOverrides {
  db?: Database;
  logger?: Logger;
  auth?: Auth;
}

/** Application Factory (composition root): cria e injeta todas as dependências. */
export function createApp(config: AppConfig, overrides: AppOverrides = {}) {
  const logger = overrides.logger ?? createConsoleLogger(config.logLevel);
  const ownedDb = overrides.db ? null : createDb(config.databaseUrl);
  const db = overrides.db ?? (ownedDb as NonNullable<typeof ownedDb>).db;
  const auth = overrides.auth ?? createAuth({ db, config });

  // Módulos de domínio (categories, transactions, recurrences, dashboard, data-exchange)
  // serão compostos aqui, recebendo { db } e interfaces de outros módulos.
  const routes: RouteDefinition[] = [healthRoute];

  async function dispatch(route: RouteDefinition, req: Request, params: Record<string, string>): Promise<Response> {
    const requestId = crypto.randomUUID(); // sempre gerado no servidor
    try {
      const user = await resolveUser(auth, req);
      if (route.access === "private" && !user) throw new UnauthenticatedError();
      const ctx: RequestContext = { requestId, user, logger, now: new Date() };
      const res = await route.handler(req, ctx, params);
      res.headers.set("X-Request-Id", requestId);
      return res;
    } catch (error) {
      return toErrorResponse(error, { requestId, logger });
    }
  }

  return {
    config,
    logger,
    routes,
    dispatch,
    authHandler: (req: Request) => auth.handler(req), // montado em /api/auth/*
    notFound: () => toErrorResponse(new NotFoundError("Rota"), { requestId: crypto.randomUUID(), logger }),
    onError: (error: unknown) => toErrorResponse(error, { requestId: crypto.randomUUID(), logger }),
    async close() {
      await ownedDb?.close();
    },
  };
}

export type App = ReturnType<typeof createApp>;
