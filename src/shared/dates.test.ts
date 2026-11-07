import { describe, expect, it } from "vitest";
import { isRealCalendarDate, monthRange, projectDates } from "./dates";

describe("dates", () => {
  it("ajusta o dia de vencimento em meses curtos", () => {
    const dates = projectDates({ startDate: "2026-01-31", endDate: null, dueDay: 31, months: 3 });
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("respeita a data final da recorrência", () => {
    const dates = projectDates({ startDate: "2026-01-10", endDate: "2026-02-15", dueDay: 10, months: 6 });
    expect(dates).toEqual(["2026-01-10", "2026-02-10"]);
  });

  it("calcula o intervalo do mês, inclusive na virada do ano", () => {
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
  });

  it.each([
    ["2026-02-28", true],
    ["2026-02-30", false],
    ["2028-02-29", true],
    ["abc", false],
  ])("isRealCalendarDate(%s) → %s", (value, expected) => {
    expect(isRealCalendarDate(value)).toBe(expected);
  });
});
