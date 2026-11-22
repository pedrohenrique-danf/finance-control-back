import { dueDateIn, monthOf, shiftMonth } from "@/shared/dates";
import type { TransactionStatus } from "@/shared/enums";
import type { ScheduleEntry } from "./recurrences.schemas";

/** Meses mostrados na agenda da recorrência (docs/07). */
export const SCHEDULE_MONTHS = 6;

interface Period {
  dueDay: number;
  startDate: string;
  endDate: string | null;
}

/** A data está dentro do período da recorrência? */
export function covers(rec: Pick<Period, "startDate" | "endDate">, date: string): boolean {
  return rec.startDate <= date && (rec.endDate === null || date <= rec.endDate);
}

/**
 * Ocorrências a lançar até `toMonth` (inclusive), continuando do mês seguinte ao último já materializado.
 * `marker` é o novo valor de `ultimo_mes_materializado` (null = nada a fazer: o período ainda não começou).
 */
export function pendingOccurrences(
  rec: Period & { lastMaterializedMonth: string | null },
  toMonth: string,
): { dates: string[]; marker: string | null } {
  const from = rec.lastMaterializedMonth ? shiftMonth(monthOf(rec.lastMaterializedMonth), 1) : monthOf(rec.startDate);
  if (from > toMonth) return { dates: [], marker: null };
  const dates: string[] = [];
  for (let month = from; month <= toMonth; month = shiftMonth(month, 1)) {
    const date = dueDateIn(rec.dueDay, month);
    if (covers(rec, date)) dates.push(date);
  }
  return { dates, marker: `${toMonth}-01` };
}

/** Agenda: `SCHEDULE_MONTHS` meses a partir do mês corrente que a recorrência cobre. */
export function buildSchedule(
  rec: Period,
  currentMonth: string,
  posted: ReadonlyArray<{ id: string; date: string; status: TransactionStatus }>,
): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  for (let i = 0; i < SCHEDULE_MONTHS; i++) {
    const month = shiftMonth(currentMonth, i);
    const dueDate = dueDateIn(rec.dueDay, month);
    if (!covers(rec, dueDate)) continue;
    const found = posted.find((t) => monthOf(t.date) === month);
    entries.push({ month, dueDate, status: found?.status ?? "prevista", transactionId: found?.id ?? null });
  }
  return entries;
}
