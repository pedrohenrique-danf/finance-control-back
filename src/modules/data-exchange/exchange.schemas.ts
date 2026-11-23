import { z } from "zod";
import {
  type DataFormat,
  type DataOperationStatus,
  type DataOperationType,
  dataFormats,
  transactionNatures,
  transactionStatuses,
  transactionTypes,
} from "@/shared/enums";
import { isoDateSchema, monthSchema, moneySchema } from "@/shared/schemas";
import { MAX_ROWS } from "./parsers/csv";

/** POST /imports: linhas revisadas pelo usuário (docs/07, "Fluxo em duas etapas"). */
export const confirmImportSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    format: z.enum(dataFormats),
    rows: z
      .array(
        z
          .object({
            date: isoDateSchema,
            description: z.string().trim().min(1).max(160),
            amount: moneySchema,
            type: z.enum(transactionTypes),
            nature: z.enum(transactionNatures).nullable(),
            status: z.enum(transactionStatuses),
            categoryId: z.uuid().nullable(),
            valueSourceId: z.uuid().nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ROWS),
    /** Erros da pré-visualização, gravados em importacao_erros para o histórico. */
    errors: z
      .array(
        z
          .object({
            line: z.number().int(),
            field: z.string().nullable(),
            message: z.string(),
            content: z.string().nullable(),
          })
          .strict(),
      )
      .max(MAX_ROWS),
  })
  .strict();

export type ConfirmImportInput = z.output<typeof confirmImportSchema>;

export const exportQuerySchema = z.object({ month: monthSchema, format: z.literal("csv").default("csv") }).strict();

export interface DataOperationDto {
  id: string;
  type: DataOperationType;
  format: DataFormat;
  status: DataOperationStatus;
  fileName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  totalRows: number;
  successRows: number;
  errorRows: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}
