import type { Database } from "@/db/client";
import type { Notifier } from "@/modules/notifications";
import { createValueSourcesRepository } from "./value-sources.repository";
import { createValueSourcesRoutes } from "./value-sources.routes";
import { createValueSourcesService } from "./value-sources.service";

export type { ValueSourceDto } from "./value-sources.schemas";
export type { ValueSourcesService } from "./value-sources.service";

export function createValueSourcesModule(deps: { db: Database; notifier: Notifier }) {
  const repository = createValueSourcesRepository(deps.db);
  const service = createValueSourcesService({ repository, notifier: deps.notifier });
  return { service, routes: createValueSourcesRoutes(service) };
}
