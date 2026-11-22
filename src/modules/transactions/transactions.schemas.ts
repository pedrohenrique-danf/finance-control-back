import { z } from "zod";
import {
  type TransactionNature,
  type TransactionOrigin,
  type TransactionStatus,
  type TransactionType,
  transactionNatures,
  transactionStatuses,
  transactionTypes,
} from "@/shared/enums";
import { isoDateSchema, monthSchema, moneySchema } from "@/shared/schemas";

const fields = {
  type: z.enum(transactionTypes),
  nature: z.enum(transactionNatures).nullable().optional(),
  description: z.string().trim().min(1).max(160),
  amount: moneySchema,
  date: isoDateSchema,
  status: z.enum(transactionStatuses).default("efetivada"), // coluna status (default do banco)
  categoryId: z.uuid().nullable().optional(),
  valueSourceId: z.uuid().nullable().optional(),
};

/** Espelha ck_transacoes_natureza. */
function natureRule(v: { type: TransactionType; nature?: TransactionNature | null | undefined }, ctx: z.RefinementCtx) {
  if (v.type === "despesa" && !v.nature) {
    ctx.addIssue({ code: "custom", path: ["nature"], message: "Informe se a despesa é fixa ou variável." });
  }
  if (v.type === "receita" && v.nature) {
    ctx.addIssue({ code: "custom", path: ["nature"], message: "Receitas não têm natureza." });
  }
}

/** PUT substitui o recurso inteiro. `origin` e `recurrenceId` não são editáveis. */
export const updateTransactionSchema = z.object(fields).strict().superRefine(natureRule);

/** POST aceita `repeatMonthly` para criar a recorrência junto (docs/07, "Repetir todo mês"). */
export const createTransactionSchema = z
  .object({
    ...fields,
    repeatMonthly: z
      .object({ dueDay: z.number().int().min(1).max(31), endDate: isoDateSchema.nullable() })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine(natureRule);

export type CreateTransactionInput = z.output<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.output<typeof updateTransactionSchema>;

const uuidList = z
  .string()
  .transform((v) => v.split(",").filter(Boolean))
  .pipe(z.array(z.uuid()).max(50));

/** Extrato (RF06). Sem `from`/`to`, filtra pelo mês; com período, o mês é ignorado. */
export const listTransactionsQuerySchema = z
  .object({
    month: monthSchema.optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    q: z.string().trim().max(100).optional(), // busca na descrição, sem diferenciar acentos/maiúsculas
    type: z.enum(transactionTypes).optional(),
    nature: z.enum(transactionNatures).optional(),
    status: z.enum(transactionStatuses).optional(),
    categoryIds: uuidList.optional(), // CSV: ?categoryIds=uuid1,uuid2
    valueSourceIds: uuidList.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine((v) => v.month || v.from || v.to || v.valueSourceIds?.length, {
    path: ["month"],
    message: "Informe o mês, um período ou uma conta.",
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { path: ["to"], message: "Período inválido." });

export type ListTransactionsQuery = z.output<typeof listTransactionsQuerySchema>;

export interface TransactionDto {
  id: string;
  type: TransactionType;
  nature: TransactionNature | null;
  description: string;
  amount: string;
  date: string;
  status: TransactionStatus;
  origin: TransactionOrigin;
  categoryId: string | null;
  valueSourceId: string | null;
  recurrenceId: string | null;
}
