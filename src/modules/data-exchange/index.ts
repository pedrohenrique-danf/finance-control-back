import type { Database } from "@/db/client";
import type { Notifier } from "@/modules/notifications";
import type { RecurrencesService } from "@/modules/recurrences";
import type { ReferenceLookups } from "@/shared/references";
import { createDataExchangeRoutes } from "./data-exchange.routes";
import { createExchangeRepository } from "./exchange.repository";
import { createExchangeService } from "./exchange.service";
import type { PdfLine } from "./import.types";
import { createImportPreviewService } from "./import-preview.service";

export { buildTransactionsCsv } from "./exchange.service";
export type { ImportPreview, ImportRow, ImportRowError, ImportSource } from "./import.types";
export { createImportPreviewService, type ImportPreviewService } from "./import-preview.service";
export { extractPdfLines } from "./pdf/extract-lines";

export function createDataExchangeModule(deps: {
  db: Database;
  lookups: ReferenceLookups;
  recurrences: Pick<RecurrencesService, "materializeDue">;
  notifier: Notifier;
  /** Extração de texto do PDF (os testes injetam linhas prontas). */
  extractPdfLines: (data: Uint8Array) => Promise<PdfLine[]>;
}) {
  const preview = createImportPreviewService({ extractPdfLines: deps.extractPdfLines });
  const exchange = createExchangeService({
    repository: createExchangeRepository(deps.db),
    lookups: deps.lookups,
    recurrences: deps.recurrences,
    notifier: deps.notifier,
  });
  return { preview, exchange, routes: createDataExchangeRoutes({ preview, exchange }) };
}
