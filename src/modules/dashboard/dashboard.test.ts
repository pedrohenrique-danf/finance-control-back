import { describe, expect, it } from "vitest";
import { upcomingExpenses } from "./dashboard.service";

const rec = (id: string, dueDay: number, extra: Partial<{ startDate: string; endDate: string | null }> = {}) => ({
  id,
  description: id,
  amount: "10.00",
  categoryId: null,
  dueDay,
  startDate: "2026-01-01",
  endDate: null,
  ...extra,
});

describe("upcomingExpenses (próximas despesas fixas)", () => {
  it("vencimento de hoje em diante; o que já venceu no mês vai para o mês seguinte", () => {
    const result = upcomingExpenses([rec("aluguel", 5), rec("streaming", 22)], [], "2026-11-21");
    expect(result.map((u) => [u.recurrenceId, u.dueDate])).toEqual([
      ["streaming", "2026-11-22"],
      ["aluguel", "2026-12-05"],
    ]);
  });

  it("pula o mês já efetivado e limita a 3, em ordem de vencimento", () => {
    const result = upcomingExpenses(
      [rec("a", 22), rec("b", 23), rec("c", 24), rec("d", 25)],
      [{ recurrenceId: "a", date: "2026-11-20" }],
      "2026-11-21",
    );
    expect(result.map((u) => [u.recurrenceId, u.dueDate])).toEqual([
      ["b", "2026-11-23"],
      ["c", "2026-11-24"],
      ["d", "2026-11-25"],
    ]);
  });

  it("respeita início e término da recorrência", () => {
    const result = upcomingExpenses(
      [rec("acabou", 25, { endDate: "2026-11-10" }), rec("comeca", 25, { startDate: "2026-12-01" })],
      [],
      "2026-11-21",
    );
    expect(result.map((u) => [u.recurrenceId, u.dueDate])).toEqual([["comeca", "2026-12-25"]]);
  });
});
