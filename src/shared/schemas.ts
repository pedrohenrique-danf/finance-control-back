import { z } from "zod";
import { isRealCalendarDate } from "./dates";

// Schemas de borda reutilizados pelos módulos (docs/07, "Validação").

/** Limite mínimo das datas de transação (ck_transacoes_data). */
export const MIN_DATE = "2000-01-01";

/** Limite máximo da data de um lançamento: até 1 ano depois de hoje (UTC). Calculado a cada validação. */
export function maxTransactionDate(now = new Date()): string {
  const limit = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()));
  return limit.toISOString().slice(0, 10);
}

/** Valor positivo com ponto decimal e até 2 casas ("89.90"). */
export const moneySchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Use ponto decimal com até 2 casas (ex.: 89.90).")
  .refine((v) => Number(v) > 0, "O valor deve ser maior que zero.");

/** Valor que pode ser negativo (saldo inicial). */
export const signedMoneySchema = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Use ponto decimal (ex.: -150.00).");

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD.")
  .refine(isRealCalendarDate, "Data inexistente.")
  .refine((v) => v >= MIN_DATE, `Data anterior a ${MIN_DATE}.`);

/** Data de um lançamento (criar, editar, importar): a partir de MIN_DATE e até 1 ano à frente. */
export const transactionDateSchema = isoDateSchema.refine(
  (v) => v <= maxTransactionDate(),
  "Use uma data até 1 ano a partir de hoje.",
);

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato YYYY-MM.");

/** `:id` da URI: id que não é UUID → 400 (docs/02, "400 ≠ 404"). */
export const idParamsSchema = z.object({ id: z.uuid("Id inválido.") });

/** Paginação simples (?page=&pageSize=). */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Normaliza dinheiro para 2 casas ("89.9" → "89.90"), como o numeric(14,2) devolve. */
export function toMoney(value: string): string {
  const negative = value.startsWith("-");
  const [int = "0", frac = ""] = value.replace("-", "").split(".");
  const normalized = `${int.replace(/^0+(?=\d)/, "")}.${frac.padEnd(2, "0").slice(0, 2)}`;
  return negative && Number(normalized) !== 0 ? `-${normalized}` : normalized;
}
