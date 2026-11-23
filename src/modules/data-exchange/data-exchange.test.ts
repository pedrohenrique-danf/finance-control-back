import { describe, expect, it } from "vitest";
import type { AppConfig } from "@/app/config";
import { createApp } from "@/app/create-app";
import { createHonoServer } from "@/app/http/hono-adapter";
import type { Database } from "@/db/client";
import type { Auth } from "@/modules/auth";
import { createImportPreviewService } from "./import-preview.service";
import { parseTransactionsCsv, splitCsvLine, toCsvLine } from "./parsers/csv";
import { parseBrlAmount, parseCsvDate, splitTrailingAmount } from "./parsers/pt-br";
import { extractPdfLines } from "./pdf/extract-lines";
import { makePdf, type PdfText } from "./test-support/make-pdf";

const service = createImportPreviewService({ extractPdfLines });
const pdfFile = (pages: PdfText[][], name = "extrato.pdf") => ({
  name,
  type: "application/pdf",
  bytes: makePdf(pages),
});
const row = (x: number, top: number, text: string): PdfText => ({ x, top, text });

describe("valores e datas pt-BR", () => {
  it.each([
    ["1.447,00", "1447.00", false],
    ["R$ 48,49", "48.49", false],
    ["-R$ 2.953,93", "2953.93", true],
    ["−R$ 2.953,93", "2953.93", true],
    ["+ 3.687,11", "3687.11", false],
    ["- 3.453,93", "3453.93", true],
    ["0,50", "0.50", false],
  ])("%s → %s (negativo=%s)", (text, amount, negative) => {
    expect(parseBrlAmount(text)).toEqual({ amount, negative });
  });

  it("rejeita formatos ambíguos", () => {
    expect(parseBrlAmount("1,447.00")).toBeNull();
    expect(parseBrlAmount("12")).toBeNull();
    expect(parseBrlAmount("1.44,00")).toBeNull();
  });

  it("separa o valor no fim da linha", () => {
    expect(splitTrailingAmount("30 SET •••• 1234 Amazon - Parcela 4/6 R$ 48,49")).toEqual({
      before: "30 SET •••• 1234 Amazon - Parcela 4/6",
      value: "R$ 48,49",
    });
    expect(splitTrailingAmount("Coffee House.")).toBeNull();
  });

  it("datas do CSV: dd/mm/aaaa ou ISO, só datas reais", () => {
    expect(parseCsvDate("05/11/2026")).toBe("2026-11-05");
    expect(parseCsvDate("2026-11-05")).toBe("2026-11-05");
    expect(parseCsvDate("31/02/2026")).toBeNull();
    expect(parseCsvDate("5/11/26")).toBeNull();
  });
});

describe("CSV padrão Excel pt-BR", () => {
  const header = "data;descricao;valor;tipo;natureza;situacao;categoria;conta";

  it("lê linhas válidas (com BOM, aspas e sinônimos de situação)", () => {
    const csv = [
      `﻿${header}`,
      "05/11/2026;Salário estágio;4.200,00;receita;;efetivada;Salário;Nubank",
      '02/11/2026;"Mercado; Pão de Açúcar";214,37;despesa;variavel;pago;Alimentação;Cartão Inter',
      "2026-11-10;Internet;99,90;Despesa;fixa;Pendente;;",
      "",
    ].join("\r\n");
    const { rows, errors } = parseTransactionsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.line, r.date, r.description, r.amount, r.type, r.nature, r.status])).toEqual([
      [2, "2026-11-05", "Salário estágio", "4200.00", "receita", null, "efetivada"],
      [3, "2026-11-02", "Mercado; Pão de Açúcar", "214.37", "despesa", "variavel", "efetivada"],
      [4, "2026-11-10", "Internet", "99.90", "despesa", "fixa", "pendente"],
    ]);
    expect(rows[0]).toMatchObject({ categoryName: "Salário", accountName: "Nubank" });
    expect(rows[2]).toMatchObject({ categoryName: null, accountName: null });
  });

  it("recusa datas fora do intervalo (antes de 2000 ou mais de 1 ano à frente)", () => {
    const csv = [header, "31/12/1999;Antiga;10,00;despesa;;;;", "01/01/2999;Futura;10,00;despesa;;;;"].join("\n");
    const { rows, errors } = parseTransactionsCsv(csv);
    expect(rows).toEqual([]);
    expect(errors.map((e) => [e.line, e.field])).toEqual([
      [2, "data"],
      [3, "data"],
    ]);
  });

  it("aponta o erro por linha e campo, sem interromper as demais", () => {
    const csv = [
      header,
      "31/02/2026;X;10,00;despesa;;;;",
      "01/11/2026;;10,00;despesa;;;;",
      "01/11/2026;Y;-10,00;despesa;;;;",
      "01/11/2026;Z;10,00;transferencia;;;;",
      "01/11/2026;Ok;10,00;despesa;;;;",
    ].join("\n");
    const { rows, errors } = parseTransactionsCsv(csv);
    expect(rows.map((r) => r.description)).toEqual(["Ok"]);
    expect(errors.map((e) => [e.line, e.field])).toEqual([
      [2, "data"],
      [3, "descricao"],
      [4, "valor"],
      [5, "tipo"],
    ]);
  });

  it("exige separador ; e as colunas obrigatórias", () => {
    expect(parseTransactionsCsv("data,descricao,valor,tipo\n").errors[0]?.message).toMatch(/ponto e vírgula/);
    expect(parseTransactionsCsv("data;descricao\n").errors[0]?.message).toMatch(/valor, tipo/);
  });

  it("ida e volta de células com aspas", () => {
    const line = toCsvLine(["01/11/2026", 'Loja "A"; B', "1,00"]);
    expect(splitCsvLine(line)).toEqual(["01/11/2026", 'Loja "A"; B', "1,00"]);
  });
});

describe("PDF: fatura do cartão Nubank", () => {
  const fatura = [
    row(40, 60, "Data de vencimento: 09 NOV 2026"),
    row(40, 75, "Período vigente: 30 SET a 31 OUT"),
    row(40, 110, "Fatura anterior"),
    row(480, 110, "R$ 2.953,93"),
    row(40, 125, "Pagamento recebido"),
    row(480, 125, "-R$ 2.953,93"),
    row(40, 140, "Total de compras de todos os cartões, 30 SET a 31 OUT"),
    row(480, 140, "R$ 2.627,53"),
    row(40, 170, "Total a pagar"),
    row(460, 170, "R$ 2.692,53"),
    row(40, 220, "30 SET"),
    row(80, 220, "•••• 1234"),
    row(130, 220, "Amazon Marketplace - Parcela 4/6"),
    row(480, 220, "R$ 48,49"),
    row(40, 240, "01 OUT"),
    row(80, 240, "•••• 1234"),
    row(130, 240, "Coffee House."),
    row(480, 240, "R$ 8,50"),
    row(40, 260, "01 OUT"),
    row(80, 260, "•••• 1234"),
    row(130, 260, "Dl*Uberrides"),
    row(480, 260, "R$ 22,94"),
    row(40, 280, "09 OUT"),
    row(130, 280, "Pagamento em 09 OUT"),
    row(470, 280, "-R$ 2.953,93"),
    row(40, 300, "12 OUT"),
    row(80, 300, "•••• 1234"),
    row(130, 300, "Estorno - Loja Exemplo"),
    row(475, 300, "-R$ 30,00"),
  ];

  it("lê período, compras, parcelas, estornos e marca o pagamento para não importar", async () => {
    const preview = await service.preview(pdfFile([fatura], "fatura-nubank.pdf"));
    expect(preview.source).toBe("nubank_fatura");
    expect(preview.period).toEqual({ start: "2026-09-30", end: "2026-10-31" });
    expect(preview.errors).toEqual([]);
    expect(preview.rows.map((r) => [r.date, r.description, r.amount, r.type, r.installment, r.suggestedSkip])).toEqual([
      ["2026-09-30", "Amazon Marketplace - Parcela 4/6", "48.49", "despesa", "4/6", false],
      ["2026-10-01", "Coffee House.", "8.50", "despesa", null, false],
      ["2026-10-01", "Dl*Uberrides", "22.94", "despesa", null, false],
      ["2026-10-09", "Pagamento em 09 OUT", "2953.93", "receita", null, true],
      ["2026-10-12", "Estorno - Loja Exemplo", "30.00", "receita", null, false],
    ]);
    expect(preview.rows[0]).toMatchObject({ nature: "variavel", status: "efetivada" });
    expect(preview.rows[4]?.nature).toBeNull();
  });

  it("fatura de janeiro: compras de dezembro ficam no ano anterior", async () => {
    const preview = await service.preview(
      pdfFile([
        [
          row(40, 60, "Data de vencimento: 09 JAN 2027"),
          row(40, 75, "Período vigente: 30 NOV a 31 DEZ"),
          row(40, 100, "28 DEZ"),
          row(130, 100, "Presente de Natal"),
          row(480, 100, "R$ 120,00"),
        ],
      ]),
    );
    expect(preview.period).toEqual({ start: "2026-11-30", end: "2026-12-31" });
    expect(preview.rows[0]?.date).toBe("2026-12-28");
  });
});

describe("PDF: extrato da conta Nubank", () => {
  const extrato = [
    row(40, 40, "01 DE OUTUBRO DE 2026 a 31 DE OUTUBRO DE 2026"),
    row(470, 40, "VALORES EM R$"),
    row(300, 70, "Saldo inicial"),
    row(480, 70, "0,00"),
    row(300, 85, "Total de entradas"),
    row(480, 85, "+7.167,92"),
    row(300, 100, "Total de saídas"),
    row(480, 100, "-7.144,92"),
    row(40, 130, "Movimentações"),
    row(40, 150, "07 OUT 2026"),
    row(130, 150, "Total de entradas"),
    row(480, 150, "+ 3.687,11"),
    row(130, 170, "Transferência recebida pelo Pix"),
    row(300, 170, "FULANO DE TAL"),
    row(480, 170, "1.447,00"),
    row(300, 182, "•••.123.456-••"),
    row(300, 194, "BANCO EXEMPLO (0001)"),
    row(130, 215, "Valor adicionado na conta por"),
    row(300, 215, "Valor adicionado para Pix no Crédito"),
    row(480, 215, "500,00"),
    row(130, 227, "cartão de crédito"),
    row(130, 250, "Transferência recebida pelo Pix"),
    row(300, 250, "CICLANA"),
    row(480, 250, "1.740,11"),
    row(130, 290, "Total de saídas"),
    row(480, 290, "- 3.453,93"),
    row(130, 310, "Transferência enviada pelo Pix"),
    row(300, 310, "BELTRANO"),
    row(480, 310, "500,00"),
    row(130, 350, "Pagamento de fatura"),
    row(480, 350, "2.953,93"),
    row(40, 390, "09 OUT 2026"),
    row(130, 390, "Total de entradas"),
    row(480, 390, "+ 2.000,00"),
    row(130, 410, "Transferência recebida pelo Pix"),
    row(300, 410, "FULANO"),
    row(480, 410, "2.000,00"),
    row(40, 800, "Tem alguma dúvida? Fale com a gente pelo app."),
    row(500, 820, "1 de 2"),
  ];

  it("lê o período e os itens por bloco de entradas/saídas, juntando linhas de continuação", async () => {
    const preview = await service.preview(pdfFile([extrato]));
    expect(preview.source).toBe("nubank_extrato");
    expect(preview.period).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(preview.errors).toEqual([]);
    expect(preview.rows.map((r) => [r.date, r.type, r.amount, r.description])).toEqual([
      [
        "2026-10-07",
        "receita",
        "1447.00",
        "Transferência recebida pelo Pix — FULANO DE TAL •••.123.456-•• BANCO EXEMPLO (0001)",
      ],
      [
        "2026-10-07",
        "receita",
        "500.00",
        "Valor adicionado na conta por cartão de crédito — Valor adicionado para Pix no Crédito",
      ],
      ["2026-10-07", "receita", "1740.11", "Transferência recebida pelo Pix — CICLANA"],
      ["2026-10-07", "despesa", "500.00", "Transferência enviada pelo Pix — BELTRANO"],
      ["2026-10-07", "despesa", "2953.93", "Pagamento de fatura"],
      ["2026-10-09", "receita", "2000.00", "Transferência recebida pelo Pix — FULANO"],
    ]);
    expect(preview.rows[3]?.nature).toBe("variavel");
    expect(preview.rows[4]?.note).toMatch(/fatura do cartão/);
  });

  it("dia que continua na página seguinte mantém data e bloco", async () => {
    const preview = await service.preview(
      pdfFile([
        [
          row(40, 130, "Movimentações"),
          row(40, 150, "07 OUT 2026"),
          row(130, 150, "Total de saídas"),
          row(480, 150, "- 10,00"),
        ],
        [row(130, 60, "Compra no débito"), row(300, 60, "PADARIA"), row(480, 60, "10,00")],
      ]),
    );
    expect(preview.rows).toMatchObject([{ date: "2026-10-07", type: "despesa", amount: "10.00" }]);
  });
});

describe("validação do arquivo", () => {
  it("PDF de outro banco, formato não suportado, vazio e grande demais", async () => {
    await expect(service.preview(pdfFile([[row(40, 60, "Extrato Banco Qualquer")]]))).rejects.toMatchObject({
      status: 400,
      details: [{ path: "file", message: expect.stringMatching(/não reconhecido/) }],
    });
    const bytes = new TextEncoder().encode("abc");
    await expect(service.preview({ name: "a.xlsx", type: "", bytes })).rejects.toMatchObject({ status: 400 });
    await expect(service.preview({ name: "a.csv", type: "", bytes: new Uint8Array() })).rejects.toMatchObject({
      details: [{ message: "Arquivo vazio." }],
    });
    await expect(
      service.preview({ name: "a.csv", type: "", bytes: new Uint8Array(5 * 1024 * 1024 + 1) }),
    ).rejects.toMatchObject({ details: [{ message: "Arquivo maior que 5 MB." }] });
  });
});

describe("rota POST /api/v1/imports/preview", () => {
  const config: AppConfig = {
    env: "test",
    port: 0,
    databaseUrl: "postgresql://u:p@localhost/test",
    databaseUrlDirect: undefined,
    betterAuthSecret: "x".repeat(32),
    betterAuthUrl: "http://localhost:3001",
    google: undefined,
    mail: undefined,
    corsOrigins: [],
    logLevel: "error",
  };
  const server = (user: { id: string; email: string; name: string } | null) =>
    createHonoServer(
      createApp(config, {
        db: {} as unknown as Database,
        auth: {
          api: { getSession: async () => (user ? { user, session: {} } : null) },
          handler: async () => new Response(null, { status: 404 }),
        } as unknown as Auth,
      }),
    );
  const upload = (csv: string) => {
    const form = new FormData();
    form.set("file", new File([csv], "transacoes.csv", { type: "text/csv" }));
    return { method: "POST", body: form };
  };

  it("exige sessão (401)", async () => {
    const res = await server(null).request("/api/v1/imports/preview", upload("x"));
    expect(res.status).toBe(401);
  });

  it("devolve a pré-visualização do CSV", async () => {
    const res = await server({ id: "u1", email: "a@b.c", name: "A" }).request(
      "/api/v1/imports/preview",
      upload("data;descricao;valor;tipo\n01/11/2026;Café;8,50;despesa\n"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      source: "csv",
      fileName: "transacoes.csv",
      rows: [{ date: "2026-11-01", description: "Café", amount: "8.50", type: "despesa" }],
      errors: [],
    });
  });

  it("sem arquivo → 400 em `file`", async () => {
    const res = await server({ id: "u1", email: "a@b.c", name: "A" }).request("/api/v1/imports/preview", {
      method: "POST",
      body: new FormData(),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { details: [{ path: "file" }] } });
  });
});
