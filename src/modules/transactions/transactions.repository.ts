import { and, count, desc, eq, gte, inArray, lt, lte, type SQL, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { transactions } from "@/db/schema";
import { monthRange } from "@/shared/dates";
import type { TransactionNature, TransactionOrigin, TransactionStatus, TransactionType } from "@/shared/enums";
import type { ListTransactionsQuery, TransactionDto } from "./transactions.schemas";

export const transactionColumns = {
  id: transactions.id,
  type: transactions.type,
  nature: transactions.nature,
  description: transactions.description,
  amount: transactions.amount,
  date: transactions.date,
  status: transactions.status,
  origin: transactions.origin,
  categoryId: transactions.categoryId,
  valueSourceId: transactions.valueSourceId,
  recurrenceId: transactions.recurrenceId,
};

type Row = Pick<
  typeof transactions.$inferSelect,
  | "id"
  | "type"
  | "nature"
  | "description"
  | "amount"
  | "date"
  | "status"
  | "origin"
  | "categoryId"
  | "valueSourceId"
  | "recurrenceId"
>;

export const toTransactionDto = (r: Row): TransactionDto => ({
  ...r,
  type: r.type as TransactionType,
  nature: r.nature as TransactionNature | null,
  status: r.status as TransactionStatus,
  origin: r.origin as TransactionOrigin,
});

/** Campos gravados pelo serviço (origem e recorrência são definidas por ele, não pelo cliente). */
export interface TransactionWrite {
  type: TransactionType;
  nature: TransactionNature | null;
  description: string;
  amount: string;
  date: string;
  status: TransactionStatus;
  categoryId: string | null;
  valueSourceId: string | null;
}

// Busca sem acentos e sem diferenciar maiúsculas, sem depender da extensão unaccent nem da collation do banco.
const ACCENTED = "ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ";
const PLAIN = ACCENTED.normalize("NFD").replace(/\p{Diacritic}/gu, "");

export const foldText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Soma monetária exata no SQL (opcionalmente com `filter (where …)`); `0.00` quando não há linhas. */
export const sumMoney = (expr: SQL | typeof transactions.amount, filter?: SQL) =>
  filter
    ? sql<string>`coalesce(sum(${expr}) filter (where ${filter}), 0)::numeric(16, 2)::text`
    : sql<string>`coalesce(sum(${expr}), 0)::numeric(16, 2)::text`;

const signedAmount = sql`case when ${transactions.type} = 'receita' then ${transactions.amount} else -${transactions.amount} end`;

function filterWhere(userId: string, f: Omit<ListTransactionsQuery, "page" | "pageSize">): SQL | undefined {
  const conds: Array<SQL | undefined> = [eq(transactions.userId, userId)];
  if (f.from || f.to) {
    if (f.from) conds.push(gte(transactions.date, f.from));
    if (f.to) conds.push(lte(transactions.date, f.to));
  } else if (f.month) {
    const range = monthRange(f.month);
    conds.push(gte(transactions.date, range.start), lt(transactions.date, range.endExclusive));
  }
  if (f.q) {
    const pattern = `%${escapeLike(foldText(f.q))}%`;
    conds.push(sql`lower(translate(${transactions.description}, ${ACCENTED}, ${PLAIN})) like ${pattern}`);
  }
  if (f.type) conds.push(eq(transactions.type, f.type));
  if (f.nature) conds.push(eq(transactions.nature, f.nature));
  if (f.status) conds.push(eq(transactions.status, f.status));
  if (f.categoryIds?.length) conds.push(inArray(transactions.categoryId, f.categoryIds));
  if (f.valueSourceIds?.length) conds.push(inArray(transactions.valueSourceId, f.valueSourceIds));
  return and(...conds);
}

const byId = (userId: string, id: string) => and(eq(transactions.id, id), eq(transactions.userId, userId));

export function createTransactionsRepository(db: Database) {
  return {
    /** Página + totais do conjunto filtrado inteiro (summary e saldo por dia). */
    async list(userId: string, query: ListTransactionsQuery) {
      const where = filterWhere(userId, query);
      const [rows, totals, days] = await Promise.all([
        db
          .select(transactionColumns)
          .from(transactions)
          .where(where)
          // data desc; no mesmo dia, o último lançado primeiro
          .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db
          .select({
            total: count(),
            income: sumMoney(transactions.amount, eq(transactions.type, "receita")),
            expense: sumMoney(transactions.amount, eq(transactions.type, "despesa")),
            balance: sumMoney(signedAmount),
          })
          .from(transactions)
          .where(where),
        db
          .select({ date: transactions.date, net: sumMoney(signedAmount) })
          .from(transactions)
          .where(where)
          .groupBy(transactions.date),
      ]);
      const t = totals[0] ?? { total: 0, income: "0.00", expense: "0.00", balance: "0.00" };
      return {
        rows: rows.map(toTransactionDto),
        total: t.total,
        summary: { income: t.income, expense: t.expense, balance: t.balance },
        dayTotals: Object.fromEntries(days.map((d) => [d.date, d.net])),
      };
    },

    async findById(userId: string, id: string): Promise<TransactionDto | null> {
      const [row] = await db.select(transactionColumns).from(transactions).where(byId(userId, id)).limit(1);
      return row ? toTransactionDto(row) : null;
    },

    async insert(userId: string, data: TransactionWrite): Promise<TransactionDto> {
      const [row] = await db
        .insert(transactions)
        .values({ ...data, userId, origin: "manual" })
        .returning(transactionColumns);
      if (!row) throw new Error("insert não retornou linha");
      return toTransactionDto(row);
    },

    async update(userId: string, id: string, data: TransactionWrite): Promise<TransactionDto | null> {
      const [row] = await db.update(transactions).set(data).where(byId(userId, id)).returning(transactionColumns);
      return row ? toTransactionDto(row) : null;
    },

    async delete(userId: string, id: string): Promise<boolean> {
      const rows = await db.delete(transactions).where(byId(userId, id)).returning({ id: transactions.id });
      return rows.length > 0;
    },
  };
}

export type TransactionsRepository = ReturnType<typeof createTransactionsRepository>;
