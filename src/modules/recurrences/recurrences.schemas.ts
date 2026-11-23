import { z } from "zod";
import { type TransactionStatus, type TransactionType, transactionTypes } from "@/shared/enums";
import { isoDateSchema, moneySchema } from "@/shared/schemas";

const recurrenceFields = {
  description: z.string().trim().min(1).max(160),
  amount: moneySchema,
  dueDay: z.number().int().min(1).max(31), // dia 29–31 vira o último dia em meses curtos
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable(), // null = sem término
  categoryId: z.uuid().nullable().optional(),
  valueSourceId: z.uuid().nullable().optional(),
};

const endAfterStart = (v: { startDate: string; endDate: string | null }) => !v.endDate || v.endDate >= v.startDate;
const endMessage = { path: ["endDate"], message: "Fim antes do início." };

export const createRecurrenceSchema = z
  .object({ type: z.enum(transactionTypes).default("despesa"), ...recurrenceFields })
  .strict()
  .refine(endAfterStart, endMessage);

/** PUT: tipo imutável (como em categorias); `active` pausa/reativa. */
export const updateRecurrenceSchema = z
  .object({ ...recurrenceFields, active: z.boolean() })
  .strict()
  .refine(endAfterStart, endMessage);

export type CreateRecurrenceInput = z.output<typeof createRecurrenceSchema>;
export type UpdateRecurrenceInput = z.output<typeof updateRecurrenceSchema>;

export interface RecurrenceDto {
  id: string;
  type: TransactionType;
  description: string;
  amount: string;
  dueDay: number;
  startDate: string;
  endDate: string | null;
  active: boolean;
  categoryId: string | null;
  valueSourceId: string | null;
}

export interface ScheduleEntry {
  month: string;
  dueDate: string;
  /** Situação da ocorrência lançada, ou "prevista" quando ainda não há transação. */
  status: TransactionStatus | "prevista";
  transactionId: string | null;
}

export type RecurrenceDetailDto = RecurrenceDto & { schedule: ScheduleEntry[] };

/** Dados da transação lançada com "repetir todo mês" (POST /transactions com `repeatMonthly`). */
export interface RepeatedTransactionInput {
  type: TransactionType;
  description: string;
  amount: string;
  date: string;
  status: TransactionStatus;
  categoryId: string | null;
  valueSourceId: string | null;
  repeatMonthly: { dueDay: number; endDate: string | null };
}
