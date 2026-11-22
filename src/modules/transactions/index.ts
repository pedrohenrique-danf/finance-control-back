import type { Database } from "@/db/client";
import type { Notifier } from "@/modules/notifications";
import type { RecurrencesService } from "@/modules/recurrences";
import type { ReferenceLookups } from "@/shared/references";
import { createTransactionsRepository } from "./transactions.repository";
import { createTransactionsRoutes } from "./transactions.routes";
import { createTransactionsService } from "./transactions.service";

export { foldText } from "./transactions.repository";
export type { TransactionDto } from "./transactions.schemas";
export type { TransactionsService } from "./transactions.service";

export function createTransactionsModule(deps: {
  db: Database;
  lookups: ReferenceLookups;
  recurrences: Pick<RecurrencesService, "materializeDue" | "createFromTransaction">;
  notifier: Notifier;
}) {
  const service = createTransactionsService({
    repository: createTransactionsRepository(deps.db),
    lookups: deps.lookups,
    recurrences: deps.recurrences,
    notifier: deps.notifier,
  });
  return { service, routes: createTransactionsRoutes(service) };
}
