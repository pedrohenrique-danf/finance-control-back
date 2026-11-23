import { describe, expect, it } from "vitest";
import { foldText } from "./transactions.repository";
import { createTransactionSchema, listTransactionsQuerySchema, updateTransactionSchema } from "./transactions.schemas";

const base = {
  type: "despesa",
  nature: "variavel",
  description: "Mercado",
  amount: "89.90",
  date: "2026-11-05",
};

describe("schemas de transação", () => {
  it("status padrão é efetivada", () => {
    expect(createTransactionSchema.parse(base).status).toBe("efetivada");
  });

  it.each([
    ["despesa sem natureza", { nature: null }, "nature"],
    ["receita com natureza", { type: "receita", nature: "fixa" }, "nature"],
    ["valor com vírgula", { amount: "89,90" }, "amount"],
    ["data inexistente", { date: "2026-02-30" }, "date"],
    ["data antes de 2000", { date: "1999-12-31" }, "date"],
    ["origem enviada pelo cliente", { origin: "importacao" }, ""],
  ])("rejeita %s", (_label, patch, path) => {
    const result = updateTransactionSchema.safeParse({ ...base, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toContain(path);
  });

  it("POST aceita repeatMonthly; PUT não", () => {
    const repeat = { ...base, repeatMonthly: { dueDay: 5, endDate: null } };
    expect(createTransactionSchema.safeParse(repeat).success).toBe(true);
    expect(updateTransactionSchema.safeParse(repeat).success).toBe(false);
  });
});

describe("listTransactionsQuerySchema", () => {
  it("lê listas CSV de ids e aplica a paginação padrão", () => {
    const id = "6a0f7007-d6c6-4b65-af2d-8811a43608c5";
    expect(listTransactionsQuerySchema.parse({ month: "2026-11", categoryIds: `${id},${id}` })).toMatchObject({
      categoryIds: [id, id],
      page: 1,
      pageSize: 20,
    });
  });

  it("exige mês, período ou conta", () => {
    expect(listTransactionsQuerySchema.safeParse({}).success).toBe(false);
    expect(listTransactionsQuerySchema.safeParse({ to: "2026-11-30" }).success).toBe(true);
  });

  it("rejeita período invertido e id inválido", () => {
    expect(listTransactionsQuerySchema.safeParse({ from: "2026-11-30", to: "2026-11-01" }).success).toBe(false);
    expect(listTransactionsQuerySchema.safeParse({ month: "2026-11", categoryIds: "abc" }).success).toBe(false);
  });
});

it("busca ignora acentos e maiúsculas", () => {
  expect(foldText("Pão de AÇÚCAR")).toBe("pao de acucar");
});
