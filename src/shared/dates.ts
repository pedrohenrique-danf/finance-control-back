const pad = (n: number) => String(n).padStart(2, "0");

/** Número de dias do mês (month: 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Intervalo [start, endExclusive) de um mês "YYYY-MM". */
export function monthRange(month: string): { start: string; endExclusive: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return { start: `${y}-${pad(m)}-01`, endExclusive: `${next.y}-${pad(next.m)}-01` };
}

/** Verifica se "YYYY-MM-DD" é uma data de calendário existente. */
export function isRealCalendarDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Datas (YYYY-MM-DD) das ocorrências de uma recorrência, ajustando o dia em meses curtos. */
export function projectDates(input: {
  startDate: string;
  endDate: string | null;
  dueDay: number;
  months: number;
}): string[] {
  const [startYear, startMonth] = input.startDate.split("-").map(Number) as [number, number];
  const dates: string[] = [];
  for (let i = 0; i < input.months; i++) {
    const index = startMonth - 1 + i;
    const year = startYear + Math.floor(index / 12);
    const month = (index % 12) + 1;
    const day = Math.min(input.dueDay, daysInMonth(year, month));
    const date = `${year}-${pad(month)}-${pad(day)}`;
    if (date < input.startDate) continue;
    if (input.endDate && date > input.endDate) break;
    dates.push(date);
  }
  return dates;
}
