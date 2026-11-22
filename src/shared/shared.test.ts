import { describe, expect, it } from "vitest";
import { dueDateIn, lastDayOf, shiftMonth, todayIn } from "./dates";
import { formatBrl, formatDateBr, formatDecimalBr, formatMonthLabel, plural } from "./format";
import { referenceIssues } from "./references";
import { toMoney } from "./schemas";

describe("datas", () => {
  it("hoje no fuso de São Paulo (03:00 UTC ainda é o dia anterior)", () => {
    expect(todayIn(new Date("2026-11-22T02:59:00Z"))).toBe("2026-11-21");
    expect(todayIn(new Date("2026-11-22T03:00:00Z"))).toBe("2026-11-22");
  });

  it.each([
    ["2026-11", 1, "2026-12"],
    ["2026-12", 1, "2027-01"],
    ["2026-01", -1, "2025-12"],
    ["2026-11", -17, "2025-06"],
  ])("shiftMonth(%s, %i) → %s", (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected);
  });

  it("vencimento e último dia em meses curtos", () => {
    expect(dueDateIn(31, "2026-02")).toBe("2026-02-28");
    expect(dueDateIn(29, "2028-02")).toBe("2028-02-29");
    expect(lastDayOf("2026-04")).toBe("2026-04-30");
  });
});

describe("formatação pt-BR", () => {
  it("dinheiro, data e mês", () => {
    expect(formatBrl("1234.5")).toBe("R$ 1.234,50");
    expect(formatDecimalBr("1234.5")).toBe("1.234,50");
    expect(formatDateBr("2026-11-05")).toBe("05/11/2026");
    expect(formatMonthLabel("2026-03")).toBe("Março 2026");
    expect(plural(1, "transação", "transações")).toBe("1 transação");
    expect(plural(0, "transação", "transações")).toBe("0 transações");
  });

  it("toMoney normaliza para 2 casas", () => {
    expect(toMoney("89.9")).toBe("89.90");
    expect(toMoney("-150")).toBe("-150.00");
    expect(toMoney("007.5")).toBe("7.50");
  });
});

describe("referenceIssues (regra de negócio das referências do corpo)", () => {
  const lookups = {
    categories: {
      find: async (userId: string, id: string) =>
        userId === "a" && id === "cat-despesa" ? { type: "despesa" as const } : null,
    },
    valueSources: { find: async (userId: string, id: string) => (userId === "a" && id === "conta" ? {} : null) },
  };

  it("aceita referências do próprio usuário com tipo compatível", async () => {
    const input = { type: "despesa" as const, categoryId: "cat-despesa", valueSourceId: "conta" };
    expect(await referenceIssues(lookups, "a", input)).toEqual([]);
  });

  it("categoria de outro tipo → 400 em categoryId", async () => {
    expect(await referenceIssues(lookups, "a", { type: "receita", categoryId: "cat-despesa" })).toEqual([
      { path: "categoryId", message: "Tipo da categoria incompatível." },
    ]);
  });

  it("recursos de outro usuário parecem inexistentes", async () => {
    const issues = await referenceIssues(lookups, "b", {
      type: "despesa",
      categoryId: "cat-despesa",
      valueSourceId: "conta",
    });
    expect(issues.map((i) => i.path)).toEqual(["categoryId", "valueSourceId"]);
  });
});
