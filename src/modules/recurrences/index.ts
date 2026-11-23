import type { Database } from "@/db/client";
import type { Notifier } from "@/modules/notifications";
import type { ReferenceLookups } from "@/shared/references";
import { createRecurrencesRepository } from "./recurrences.repository";
import { createRecurrencesRoutes } from "./recurrences.routes";
import { createRecurrencesService } from "./recurrences.service";

export { buildSchedule, covers, pendingOccurrences } from "./occurrences";
export type { RecurrenceDto, RepeatedTransactionInput } from "./recurrences.schemas";
export type { RecurrencesService } from "./recurrences.service";

export function createRecurrencesModule(deps: { db: Database; lookups: ReferenceLookups; notifier: Notifier }) {
  const repository = createRecurrencesRepository(deps.db);
  const service = createRecurrencesService({ repository, lookups: deps.lookups, notifier: deps.notifier });
  return { service, routes: createRecurrencesRoutes(service) };
}
