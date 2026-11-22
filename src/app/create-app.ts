import type { AppConfig } from "@/app/config";
import { healthRoute } from "@/app/http/health";
import { toErrorResponse } from "@/app/http/responses";
import type { RequestContext, RouteDefinition } from "@/app/http/types";
import { createDb, type Database } from "@/db/client";
import { type Auth, createAuth, resolveUser } from "@/modules/auth";
import { createCategoriesModule } from "@/modules/categories";
import { createDashboardModule } from "@/modules/dashboard";
import { createDataExchangeModule, extractPdfLines } from "@/modules/data-exchange";
import { createNotificationsModule } from "@/modules/notifications";
import { createRecurrencesModule } from "@/modules/recurrences";
import { createTransactionsModule } from "@/modules/transactions";
import { createValueSourcesModule } from "@/modules/value-sources";
import { NotFoundError, UnauthenticatedError } from "@/shared/errors";
import { createConsoleLogger, type Logger } from "@/shared/logger";
import type { ReferenceLookups } from "@/shared/references";

export interface AppOverrides {
  db?: Database;
  logger?: Logger;
  auth?: Auth;
  /** Extração de texto de PDF (os testes injetam linhas prontas). */
  extractPdfLines?: typeof extractPdfLines;
}

/** Application Factory (composition root): cria e injeta todas as dependências. */
export function createApp(config: AppConfig, overrides: AppOverrides = {}) {
  const logger = overrides.logger ?? createConsoleLogger(config.logLevel);
  const ownedDb = overrides.db ? null : createDb(config.databaseUrl);
  const db = overrides.db ?? (ownedDb as NonNullable<typeof ownedDb>).db;

  // Módulos de domínio: dependem uns dos outros só por interfaces (docs/04).
  const notifications = createNotificationsModule({ db, logger });
  const notifier = notifications.service;
  const categories = createCategoriesModule({ db, notifier });
  const valueSources = createValueSourcesModule({ db, notifier });
  const lookups: ReferenceLookups = { categories: categories.service, valueSources: valueSources.service };
  const recurrences = createRecurrencesModule({ db, lookups, notifier });
  const transactions = createTransactionsModule({ db, lookups, recurrences: recurrences.service, notifier });
  const dashboard = createDashboardModule({ db, recurrences: recurrences.service });
  const dataExchange = createDataExchangeModule({
    db,
    lookups,
    recurrences: recurrences.service,
    notifier,
    extractPdfLines: overrides.extractPdfLines ?? extractPdfLines,
  });

  /** Dados iniciais do usuário novo: categorias padrão e a conta "Carteira" (o lançamento exige ambas). */
  async function onUserCreated(userId: string): Promise<void> {
    try {
      await categories.service.createDefaults(userId);
      await valueSources.service.createDefaults(userId);
    } catch (error) {
      // O cadastro não falha por isso: o usuário consegue criar categorias e contas pela interface.
      logger.error("user_defaults_failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  const auth = overrides.auth ?? createAuth({ db, config, onUserCreated });

  const routes: RouteDefinition[] = [
    healthRoute,
    ...categories.routes,
    ...valueSources.routes,
    ...transactions.routes,
    ...recurrences.routes,
    ...dashboard.routes,
    ...dataExchange.routes,
    ...notifications.routes,
  ];

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
    /** Exposto para o seed de desenvolvimento e testes de integração. */
    services: {
      auth,
      categories: categories.service,
      valueSources: valueSources.service,
      transactions: transactions.service,
      recurrences: recurrences.service,
      notifications: notifications.service,
      dashboard: dashboard.service,
      dataExchange: dataExchange.exchange,
    },
    onUserCreated,
    authHandler: (req: Request) => auth.handler(req), // montado em /api/auth/*
    notFound: () => toErrorResponse(new NotFoundError("Rota"), { requestId: crypto.randomUUID(), logger }),
    onError: (error: unknown) => toErrorResponse(error, { requestId: crypto.randomUUID(), logger }),
    async close() {
      await ownedDb?.close();
    },
  };
}

export type App = ReturnType<typeof createApp>;
