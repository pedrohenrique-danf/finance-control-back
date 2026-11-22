import type { Database } from "@/db/client";
import type { Notifier } from "@/modules/notifications";
import { createCategoriesRepository } from "./categories.repository";
import { createCategoriesRoutes } from "./categories.routes";
import { createCategoriesService } from "./categories.service";

export type { CategoryDto } from "./categories.schemas";
export type { CategoriesService } from "./categories.service";

export function createCategoriesModule(deps: { db: Database; notifier: Notifier }) {
  const service = createCategoriesService({ repository: createCategoriesRepository(deps.db), notifier: deps.notifier });
  return { service, routes: createCategoriesRoutes(service) };
}
