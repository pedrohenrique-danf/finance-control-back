import { describe, expect, it } from "vitest";
import { buildSchedule, pendingOccurrences } from "./occurrences";

const rec = { dueDay: 31, startDate: "2026-01-31", endDate: null, lastMaterializedMonth: null };

describe("pendingOccurrences (materialização sob demanda)", () => {
  it("lança do início até o mês corrente, ajustando meses curtos", () => {
    expect(pendingOccurrences(rec, "2026-03")).toEqual({
      dates: ["2026-01-31", "2026-02-28", "2026-03-31"],
      marker: "2026-03-01",
    });
  });

  it("continua do mês seguinte ao último materializado (ocorrência excluída não volta)", () => {
    expect(pendingOccurrences({ ...rec, lastMaterializedMonth: "2026-02-01" }, "2026-04")).toEqual({
      dates: ["2026-03-31", "2026-04-30"],
      marker: "2026-04-01",
    });
  });

  it("nada a fazer quando já está em dia", () => {
    expect(pendingOccurrences({ ...rec, lastMaterializedMonth: "2026-04-01" }, "2026-04")).toEqual({
      dates: [],
      marker: null,
    });
  });

  it("início no futuro: espera o mês chegar", () => {
    expect(pendingOccurrences({ ...rec, startDate: "2026-06-10" }, "2026-04")).toEqual({ dates: [], marker: null });
  });

  it("vencimento antes da data de início no 1º mês fica para o mês seguinte", () => {
    const r = { dueDay: 5, startDate: "2026-01-20", endDate: null, lastMaterializedMonth: null };
    expect(pendingOccurrences(r, "2026-02").dates).toEqual(["2026-02-05"]);
  });

  it("respeita a data de término e avança o marcador mesmo sem ocorrências", () => {
    const r = { dueDay: 10, startDate: "2026-01-10", endDate: "2026-02-15", lastMaterializedMonth: null };
    expect(pendingOccurrences(r, "2026-05")).toEqual({ dates: ["2026-01-10", "2026-02-10"], marker: "2026-05-01" });
  });

  it("vira o ano", () => {
    const r = { dueDay: 5, startDate: "2026-11-05", endDate: null, lastMaterializedMonth: "2026-11-01" };
    expect(pendingOccurrences(r, "2027-01").dates).toEqual(["2026-12-05", "2027-01-05"]);
  });
});

describe("buildSchedule (agenda de 6 meses)", () => {
  it("marca lançadas pela situação e o resto como prevista", () => {
    const schedule = buildSchedule({ dueDay: 5, startDate: "2026-05-05", endDate: "2027-02-05" }, "2026-11", [
      { id: "t1", date: "2026-11-05", status: "efetivada" },
      { id: "t2", date: "2026-12-05", status: "pendente" },
    ]);
    expect(schedule).toEqual([
      { month: "2026-11", dueDate: "2026-11-05", status: "efetivada", transactionId: "t1" },
      { month: "2026-12", dueDate: "2026-12-05", status: "pendente", transactionId: "t2" },
      { month: "2027-01", dueDate: "2027-01-05", status: "prevista", transactionId: null },
      { month: "2027-02", dueDate: "2027-02-05", status: "prevista", transactionId: null },
    ]);
  });

  it("uma ocorrência lançada em outro dia do mês ainda conta para o mês", () => {
    const [first] = buildSchedule({ dueDay: 20, startDate: "2026-11-03", endDate: null }, "2026-11", [
      { id: "t1", date: "2026-11-03", status: "efetivada" },
    ]);
    expect(first).toMatchObject({ dueDate: "2026-11-20", status: "efetivada", transactionId: "t1" });
  });
});
