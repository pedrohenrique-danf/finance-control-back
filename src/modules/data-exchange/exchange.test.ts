import { describe, expect, it } from "vitest";
import { confirmImportSchema } from "./exchange.schemas";
import { buildTransactionsCsv } from "./exchange.service";
import { parseTransactionsCsv } from "./parsers/csv";

describe("exportação CSV", () => {
  const rows = [
    {
      date: "2026-11-05",
      description: "Salário estágio",
      amount: "4200.00",
      type: "receita",
      nature: null,
      status: "efetivada",
      category: "Salário",
      account: "Nubank",
    },
    {
      date: "2026-11-02",
      description: 'Mercado; "promoção"',
      amount: "1214.37",
      type: "despesa",
      nature: "variavel",
      status: "pendente",
      category: null,
      account: null,
    },
  ];

  it("gera o formato pt-BR com BOM e CRLF", () => {
    const csv = buildTransactionsCsv(rows);
    expect(csv.startsWith("﻿data;descricao;valor;tipo;natureza;situacao;categoria;conta\r\n")).toBe(true);
    expect(csv).toContain("05/11/2026;Salário estágio;4.200,00;receita;;efetivada;Salário;Nubank\r\n");
    expect(csv).toContain('02/11/2026;"Mercado; ""promoção""";1.214,37;despesa;variavel;pendente;;\r\n');
  });

  it("o arquivo exportado é aceito pela importação (ida e volta)", () => {
    const parsed = parseTransactionsCsv(buildTransactionsCsv(rows));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((r) => [r.date, r.description, r.amount, r.type, r.status])).toEqual([
      ["2026-11-05", "Salário estágio", "4200.00", "receita", "efetivada"],
      ["2026-11-02", 'Mercado; "promoção"', "1214.37", "despesa", "pendente"],
    ]);
  });
});

describe("confirmImportSchema", () => {
  const row = {
    date: "2026-11-05",
    description: "Mercado",
    amount: "89.90",
    type: "despesa",
    nature: "variavel",
    status: "efetivada",
    categoryId: null,
    valueSourceId: null,
  };

  it("aceita linhas válidas", () => {
    expect(confirmImportSchema.safeParse({ fileName: "a.csv", format: "csv", rows: [row], errors: [] }).success).toBe(
      true,
    );
  });

  it.each([
    ["sem linhas", { rows: [] }],
    ["data inexistente", { rows: [{ ...row, date: "2026-02-30" }] }],
    ["valor zero", { rows: [{ ...row, amount: "0.00" }] }],
    ["campo desconhecido", { rows: [{ ...row, userId: "x" }] }],
  ])("rejeita %s", (_label, { rows }) => {
    const result = confirmImportSchema.safeParse({ fileName: "a.csv", format: "csv", rows, errors: [] });
    expect(result.success).toBe(false);
  });
});
