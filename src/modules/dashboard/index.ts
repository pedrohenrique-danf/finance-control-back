import type { Database } from "@/db/client";
import type { RecurrencesService } from "@/modules/recurrences";
import { createDashboardRepository } from "./dashboard.repository";
import { createDashboardRoutes } from "./dashboard.routes";
import { createDashboardService } from "./dashboard.service";

export { upcomingExpenses } from "./dashboard.service";

export function createDashboardModule(deps: { db: Database; recurrences: Pick<RecurrencesService, "materializeDue"> }) {
  const service = createDashboardService({
    repository: createDashboardRepository(deps.db),
    recurrences: deps.recurrences,
  });
  return { service, routes: createDashboardRoutes(service) };
}
