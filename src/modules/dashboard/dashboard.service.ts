import { covers, type RecurrencesService } from "@/modules/recurrences";
import { dueDateIn, monthOf, monthRange, shiftMonth, todayIn } from "@/shared/dates";
import type { DashboardRepository } from "./dashboard.repository";

export const HISTORY_MONTHS = 6;
export const UPCOMING_LIMIT = 3;

export interface UpcomingEntry {
  recurrenceId: string;
  description: string;
  amount: string;
  categoryId: string | null;
  dueDate: string;
}

/**
 * Próximas despesas fixas (docs/02): até 3 recorrências ativas de despesa com vencimento de hoje em diante
 * (mês atual ou seguinte) ainda não efetivadas. Relativas a hoje, não ao mês consultado.
 */
export function upcomingExpenses(
  recs: ReadonlyArray<
    Omit<UpcomingEntry, "dueDate" | "recurrenceId"> & {
      id: string;
      dueDay: number;
      startDate: string;
      endDate: string | null;
    }
  >,
  paid: ReadonlyArray<{ recurrenceId: string; date: string }>,
  today: string,
): UpcomingEntry[] {
  const thisMonth = monthOf(today);
  const entries: UpcomingEntry[] = [];
  for (const rec of recs) {
    for (const month of [thisMonth, shiftMonth(thisMonth, 1)]) {
      const dueDate = dueDateIn(rec.dueDay, month);
      if (dueDate < today || !covers(rec, dueDate)) continue;
      if (paid.some((p) => p.recurrenceId === rec.id && monthOf(p.date) === month)) continue;
      entries.push({
        recurrenceId: rec.id,
        description: rec.description,
        amount: rec.amount,
        categoryId: rec.categoryId,
        dueDate,
      });
      break;
    }
  }
  return entries
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.description.localeCompare(b.description, "pt-BR"))
    .slice(0, UPCOMING_LIMIT);
}

export function createDashboardService(deps: {
  repository: DashboardRepository;
  recurrences: Pick<RecurrencesService, "materializeDue">;
}) {
  const { repository, recurrences } = deps;
  return {
    async summary(userId: string, month: string, now: Date) {
      await recurrences.materializeDue(userId, now);
      const today = todayIn(now);
      const firstMonth = shiftMonth(month, -(HISTORY_MONTHS - 1));
      const thisMonth = monthOf(today);

      const [totals, byCategory, historyRows, recs] = await Promise.all([
        repository.monthTotals(userId, month),
        repository.byCategory(userId, month),
        repository.history(userId, monthRange(firstMonth).start, monthRange(month).endExclusive),
        repository.activeExpenseRecurrences(userId),
      ]);
      const paid = await repository.paidOccurrences(
        userId,
        recs.map((r) => r.id),
        monthRange(thisMonth).start,
        monthRange(shiftMonth(thisMonth, 1)).endExclusive,
      );

      const history = Array.from({ length: HISTORY_MONTHS }, (_, i) => {
        const m = shiftMonth(firstMonth, i);
        const row = historyRows.find((h) => h.month === m);
        return { month: m, income: row?.income ?? "0.00", expense: row?.expense ?? "0.00" };
      });

      return { month, ...totals, byCategory, history, upcoming: upcomingExpenses(recs, paid, today) };
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
