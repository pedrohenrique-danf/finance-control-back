import { and, eq, gte, inArray, lt, type SQL, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { recurrences, transactions } from "@/db/schema";
import { monthRange } from "@/shared/dates";
import type { TransactionType } from "@/shared/enums";

/** Soma monetária exata (numeric) com `filter (where …)`; `0.00` quando não há linhas. */
const sumWhere = (filter: SQL | undefined) =>
  sql<string>`coalesce(sum(${transactions.amount}) filter (where ${filter}), 0)::numeric(16, 2)::text`;

const isIncome = eq(transactions.type, "receita");
const isExpense = eq(transactions.type, "despesa");
const isPaid = eq(transactions.status, "efetivada");

const inPeriod = (userId: string, start: string, endExclusive: string) =>
  and(eq(transactions.userId, userId), gte(transactions.date, start), lt(transactions.date, endExclusive));

export function createDashboardRepository(db: Database) {
  return {
    async monthTotals(userId: string, month: string) {
      const range = monthRange(month);
      const [row] = await db
        .select({
          income: sumWhere(isIncome),
          fixedExpenses: sumWhere(and(isExpense, eq(transactions.nature, "fixa"))),
          variableExpenses: sumWhere(and(isExpense, eq(transactions.nature, "variavel"))),
          paidIncome: sumWhere(and(isIncome, isPaid)),
          paidExpenses: sumWhere(and(isExpense, isPaid)),
          balance: sql<string>`coalesce(sum(case when ${isIncome} then ${transactions.amount} else -${transactions.amount} end) filter (where ${isPaid}), 0)::numeric(16, 2)::text`,
          forecast: sql<string>`coalesce(sum(case when ${isIncome} then ${transactions.amount} else -${transactions.amount} end), 0)::numeric(16, 2)::text`,
        })
        .from(transactions)
        .where(inPeriod(userId, range.start, range.endExclusive));
      if (!row) throw new Error("agregação sem linha");
      return row;
    },

    /** Total do mês por tipo e categoria (`categoryId: null` = "Sem categoria"). */
    async byCategory(userId: string, month: string) {
      const range = monthRange(month);
      const rows = await db
        .select({
          type: transactions.type,
          categoryId: transactions.categoryId,
          total: sql<string>`sum(${transactions.amount})::numeric(16, 2)::text`,
        })
        .from(transactions)
        .where(inPeriod(userId, range.start, range.endExclusive))
        .groupBy(transactions.type, transactions.categoryId);
      return rows.map((r) => ({ ...r, type: r.type as TransactionType }));
    },

    /** Receitas e despesas por mês ("YYYY-MM") entre `start` e `endExclusive`. */
    history(userId: string, start: string, endExclusive: string) {
      const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
      return db
        .select({ month, income: sumWhere(isIncome), expense: sumWhere(isExpense) })
        .from(transactions)
        .where(inPeriod(userId, start, endExclusive))
        .groupBy(month);
    },

    activeExpenseRecurrences: (userId: string) =>
      db
        .select({
          id: recurrences.id,
          description: recurrences.description,
          amount: recurrences.amount,
          categoryId: recurrences.categoryId,
          dueDay: recurrences.dueDay,
          startDate: recurrences.startDate,
          endDate: recurrences.endDate,
        })
        .from(recurrences)
        .where(and(eq(recurrences.userId, userId), eq(recurrences.active, true), eq(recurrences.type, "despesa"))),

    /** Ocorrências já efetivadas das recorrências no período. */
    async paidOccurrences(userId: string, recurrenceIds: string[], start: string, endExclusive: string) {
      if (recurrenceIds.length === 0) return [];
      const rows = await db
        .select({ recurrenceId: transactions.recurrenceId, date: transactions.date })
        .from(transactions)
        .where(and(inPeriod(userId, start, endExclusive), isPaid, inArray(transactions.recurrenceId, recurrenceIds)));
      return rows.flatMap((r) => (r.recurrenceId ? [{ recurrenceId: r.recurrenceId, date: r.date }] : []));
    },
  };
}

export type DashboardRepository = ReturnType<typeof createDashboardRepository>;
