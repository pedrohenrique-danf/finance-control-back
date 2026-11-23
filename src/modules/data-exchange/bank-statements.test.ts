import { describe, expect, it } from "vitest";
import { createImportPreviewService } from "./import-preview.service";
import { parseBankCsv } from "./parsers/bank-csv";
import { institutionFromCode, institutionFromText } from "./parsers/institutions";
import { isOfx, parseOfx } from "./parsers/ofx";
import { decodeText, parseFlexibleAmount, parseFlexibleDate } from "./parsers/pt-br";
import { extractPdfLines } from "./pdf/extract-lines";
import { makePdf, type PdfText } from "./test-support/make-pdf";

// Arquivos montados a partir dos formatos públicos de exportação (sem dados reais de clientes).

const service = createImportPreviewService({
  extractPdfLines: async () => {
    throw new Error("não deveria ler PDF");
  },
});
const row = (x: number, top: number, text: string): PdfText => ({ x, top, text });
const utf8 = (text: string) => new TextEncoder().encode(text);
const file = (name: string, bytes: Uint8Array, type = "") => ({ name, type, bytes });
const summary = (rows: Array<{ date: string; description: string; amount: string; type: string }>) =>
  rows.map((r) => [r.date, r.description, r.amount, r.type]);

describe("valores, datas e codificação de arquivos de banco", () => {
  it.each([
    ["1.234,56", "1234.56", false],
    ["1234.56", "1234.56", false],
    ["1,234.56", "1234.56", false],
    ["-50.00", "50.00", true],
    ["-50,00", "50.00", true],
    ["50,00-", "50.00", true],
    ["(50,00)", "50.00", true],
    ["R$ -1.234,56", "1234.56", true],
    ["-R$ 12,90", "12.90", true],
    ["−R$ 21,57", "21.57", true],
    ["+R$ 2.005,90", "2005.90", false],
    ["+ 3.687,11", "3687.11", false],
    ["1234", "1234.00", false],
    ["12,5", "12.50", false],
    ["1.234", "1234.00", false],
  ])("%s → %s (negativo=%s)", (text, amount, negative) => {
    expect(parseFlexibleAmount(text)).toEqual({ amount, negative });
  });

  it("recusa valores que não são números", () => {
    for (const text of ["", "abc", "1.2.3,4,5", "12,", "1,23,45", "--5"]) expect(parseFlexibleAmount(text)).toBeNull();
  });

  it.each([
    ["05/11/2026", "2026-11-05"],
    ["5/11/26", "2026-11-05"],
    ["05-11-2026", "2026-11-05"],
    ["05.11.2026", "2026-11-05"],
    ["2026-11-05", "2026-11-05"],
    ["2026-11-05T10:22:00", "2026-11-05"],
    ["05/11/2026 10:22", "2026-11-05"],
    ["20261105", "2026-11-05"],
  ])("data %s → %s", (text, iso) => {
    expect(parseFlexibleDate(text)).toBe(iso);
  });

  it("recusa datas inexistentes", () => {
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
    expect(parseFlexibleDate("ontem")).toBeNull();
  });

  it("lê UTF-8 e, quando inválido, Windows-1252 (acentos de bancos tradicionais)", () => {
    expect(decodeText(utf8("﻿Descrição"))).toBe("Descrição");
    expect(decodeText(new Uint8Array([0x48, 0x69, 0x73, 0x74, 0xf3, 0x72, 0x69, 0x63, 0x6f]))).toBe("Histórico");
  });

  it("identifica o banco pelo nome ou pelo código COMPE", () => {
    expect(institutionFromText("Extrato Banco Inter S.A.")).toBe("Inter");
    expect(institutionFromText("extrato_itau_outubro")).toBe("Itaú");
    expect(institutionFromText("internet")).toBeNull();
    expect(institutionFromCode("0341")).toBe("Itaú");
    expect(institutionFromCode("1")).toBe("Banco do Brasil");
    expect(institutionFromCode("999")).toBeNull();
  });
});

describe("CSV de bancos", () => {
  it("Nubank conta: vírgula, ponto decimal e sinal define entrada/saída", () => {
    const csv = [
      "Data,Valor,Identificador,Descrição",
      "05/10/2026,-50.00,6a1f-01,Compra no débito - Padaria Pão Quente",
      '06/10/2026,1447.00,6a1f-02,"Transferência recebida pelo Pix - FULANO DE TAL - •••.123.456-••"',
      "07/10/2026,-2953.93,6a1f-03,Pagamento de fatura",
    ].join("\n");
    const result = parseBankCsv(csv, "NU_123456_01OUT2026_31OUT2026.csv");
    expect(result).toMatchObject({ institution: "Nubank", errors: [] });
    expect(summary(result?.rows ?? [])).toEqual([
      ["2026-10-05", "Compra no débito - Padaria Pão Quente", "50.00", "despesa"],
      ["2026-10-06", "Transferência recebida pelo Pix - FULANO DE TAL - •••.123.456-••", "1447.00", "receita"],
      ["2026-10-07", "Pagamento de fatura", "2953.93", "despesa"],
    ]);
  });

  it("Nubank cartão: valor positivo é compra; negativo é estorno ou pagamento (sugere não importar)", () => {
    const csv = [
      "date,title,amount",
      "2026-10-01,Amazon Marketplace - Parcela 4/6,48.49",
      "2026-10-02,Estorno Coffee House,-8.50",
      "2026-10-09,Pagamento recebido,-1200.00",
    ].join("\n");
    const result = parseBankCsv(csv, "Nubank_2026-11-09.csv");
    expect(result).toMatchObject({ institution: "Nubank", kind: "cartao", errors: [] });
    expect(summary(result?.rows ?? [])).toEqual([
      ["2026-10-01", "Amazon Marketplace - Parcela 4/6", "48.49", "despesa"],
      ["2026-10-02", "Estorno Coffee House", "8.50", "receita"],
      ["2026-10-09", "Pagamento recebido", "1200.00", "receita"],
    ]);
    expect(result?.rows[0]).toMatchObject({ installment: "4/6", nature: "variavel", suggestedSkip: false });
    expect(result?.rows[2]).toMatchObject({ suggestedSkip: true, nature: null });
  });

  it("Inter: cabeçalho depois de um resumo, Histórico + Descrição e linhas de saldo ignoradas", () => {
    const csv = [
      "Extrato Conta Corrente",
      "Conta ;12345678",
      "Período ;01/10/2026 a 31/10/2026",
      "Saldo ;1.234,56",
      "",
      "Data Lançamento;Histórico;Descrição;Valor;Saldo",
      "01/10/2026;Pix recebido;Fulano de Tal;1.500,00;2.734,56",
      "02/10/2026;Pix enviado;Mercado Bom Preço;-214,37;2.520,19",
      "03/10/2026;Compra no débito;Compra no débito;-8,50;2.511,69",
      "03/10/2026;Saldo do dia;;0,00;2.511,69",
    ].join("\n");
    const result = parseBankCsv(csv, "Extrato-01-10-2026-a-31-10-2026.csv");
    expect(result).toMatchObject({ kind: "conta", errors: [] });
    expect(summary(result?.rows ?? [])).toEqual([
      ["2026-10-01", "Pix recebido — Fulano de Tal", "1500.00", "receita"],
      ["2026-10-02", "Pix enviado — Mercado Bom Preço", "214.37", "despesa"],
      ["2026-10-03", "Compra no débito", "8.50", "despesa"],
    ]);
    expect(result?.rows[0]?.line).toBe(7);
  });

  it("colunas de débito e crédito separadas, tabulação e banco no nome do arquivo", () => {
    const csv = [
      "Data\tHistórico\tDocto.\tCrédito (R$)\tDébito (R$)\tSaldo (R$)",
      "01/10/2026\tSALDO ANTERIOR\t\t\t\t1.000,00",
      "02/10/2026\tPIX RECEBIDO FULANO\t123\t300,00\t\t1.300,00",
      "03/10/2026\tCONTA DE LUZ\t456\t\t180,25\t1.119,75",
      "Total\t\t\t300,00\t180,25\t",
    ].join("\n");
    const result = parseBankCsv(csv, "extrato_bradesco.csv");
    expect(result).toMatchObject({ institution: "Bradesco", errors: [] });
    expect(summary(result?.rows ?? [])).toEqual([
      ["2026-10-02", "PIX RECEBIDO FULANO", "300.00", "receita"],
      ["2026-10-03", "CONTA DE LUZ", "180.25", "despesa"],
    ]);
  });

  it("coluna de tipo D/C com valores sempre positivos", () => {
    const csv = ["data;lancamento;valor;d/c", "10/10/2026;SALARIO;4.200,00;C", "11/10/2026;ALUGUEL;1.200,00;D"].join(
      "\n",
    );
    expect(summary(parseBankCsv(csv)?.rows ?? [])).toEqual([
      ["2026-10-10", "SALARIO", "4200.00", "receita"],
      ["2026-10-11", "ALUGUEL", "1200.00", "despesa"],
    ]);
  });

  it("Mercado Pago: resumo antes da tabela e colunas em inglês", () => {
    const csv = [
      "INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE",
      "100,00;50,00;-30,00;120,00",
      "",
      "RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE",
      "01-10-2026;Transferência Pix recebida Fulano;111;50,00;150,00",
      "02-10-2026;Pagamento com QR Pix Padaria;222;-30,00;120,00",
    ].join("\n");
    const result = parseBankCsv(csv, "account_statement.csv");
    expect(result).toMatchObject({ institution: "Mercado Pago", errors: [] });
    expect(summary(result?.rows ?? [])).toEqual([
      ["2026-10-01", "Transferência Pix recebida Fulano", "50.00", "receita"],
      ["2026-10-02", "Pagamento com QR Pix Padaria", "30.00", "despesa"],
    ]);
  });

  it("aponta linhas com data ou valor inválidos sem interromper as demais", () => {
    const csv = ["Data;Descrição;Valor", "32/10/2026;Café;-8,50", "01/10/2026;Pão;abc", "02/10/2026;Leite;-6,00"].join(
      "\n",
    );
    const result = parseBankCsv(csv);
    expect(result?.rows.map((r) => r.description)).toEqual(["Leite"]);
    expect(result?.errors.map((e) => [e.line, e.field])).toEqual([
      [2, "data"],
      [3, "valor"],
    ]);
  });

  it("sem cabeçalho reconhecível → null", () => {
    expect(parseBankCsv("a;b;c\n1;2;3")).toBeNull();
    expect(parseBankCsv("")).toBeNull();
  });
});

const ofxSgml = [
  "OFXHEADER:100",
  "DATA:OFXSGML",
  "VERSION:102",
  "ENCODING:USASCII",
  "CHARSET:1252",
  "",
  "<OFX>",
  "<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>",
  "<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STMTRS><CURDEF>BRL",
  "<BANKACCTFROM><BANKID>0341<ACCTID>12345<ACCTTYPE>CHECKING</BANKACCTFROM>",
  "<BANKTRANLIST><DTSTART>20261001<DTEND>20261031",
  "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261002120000[-3:BRT]<TRNAMT>-214.37<FITID>1<MEMO>PIX ENVIADO MERCADO</STMTTRN>",
  "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>4200.00<FITID>2<NAME>EMPRESA LTDA<MEMO>SALARIO</STMTTRN>",
  "<STMTTRN><TRNTYPE>OTHER<DTPOSTED>20261006<TRNAMT>0.00<FITID>3<MEMO>INFORMATIVO</STMTTRN>",
  "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>2026<TRNAMT>-1.00<FITID>4<MEMO>QUEBRADO</STMTTRN>",
  "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
].join("\r\n");

const ofxXml = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE"?>
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>BRL</CURDEF>
<BANKTRANLIST><DTSTART>20260930</DTSTART><DTEND>20261031</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260930</DTPOSTED><TRNAMT>-48.49</TRNAMT><FITID>a</FITID><MEMO>Amazon - Parcela 4/6</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261009</DTPOSTED><TRNAMT>1200.00</TRNAMT><FITID>b</FITID><MEMO>Pagamento recebido</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261010</DTPOSTED><TRNAMT>-30.00</TRNAMT><FITID>c</FITID><MEMO>Café &amp; Cia</MEMO></STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

describe("OFX", () => {
  it("reconhece OFX 1.x (SGML) e 2.x (XML)", () => {
    expect(isOfx(ofxSgml)).toBe(true);
    expect(isOfx(ofxXml)).toBe(true);
    expect(isOfx("Data;Valor")).toBe(false);
  });

  it("extrato SGML: banco pelo código, período, sinal define a direção e erros por lançamento", () => {
    const result = parseOfx(ofxSgml);
    expect(result).toMatchObject({
      institution: "Itaú",
      kind: "conta",
      period: { start: "2026-10-01", end: "2026-10-31" },
    });
    expect(summary(result.rows)).toEqual([
      ["2026-10-02", "PIX ENVIADO MERCADO", "214.37", "despesa"],
      ["2026-10-05", "EMPRESA LTDA — SALARIO", "4200.00", "receita"],
    ]);
    expect(result.errors.map((e) => [e.line, e.field])).toEqual([[4, "data"]]);
  });

  it("fatura XML: parcelas, pagamento marcado para não importar e entidades decodificadas", () => {
    const result = parseOfx(ofxXml, "fatura-inter.ofx");
    expect(result).toMatchObject({ institution: "Inter", kind: "cartao", errors: [] });
    expect(summary(result.rows)).toEqual([
      ["2026-09-30", "Amazon - Parcela 4/6", "48.49", "despesa"],
      ["2026-10-09", "Pagamento recebido", "1200.00", "receita"],
      ["2026-10-10", "Café & Cia", "30.00", "despesa"],
    ]);
    expect(result.rows[0]?.installment).toBe("4/6");
    expect(result.rows[1]).toMatchObject({ suggestedSkip: true });
  });

  it("sem lançamentos → erro explicativo", () => {
    expect(parseOfx("<OFX></OFX>").errors[0]?.message).toMatch(/Nenhum lançamento/);
  });
});

describe("pré-visualização por tipo de arquivo", () => {
  it("CSV no formato do app continua com o leitor do app", async () => {
    const preview = await service.preview(
      file("transacoes.csv", utf8("data;descricao;valor;tipo;natureza\n01/11/2026;Internet;99,90;despesa;fixa\n")),
    );
    expect(preview).toMatchObject({ source: "csv", format: "csv", institution: null, kind: null });
    expect(preview.rows[0]).toMatchObject({ nature: "fixa" });
  });

  it("CSV de banco em Windows-1252 vira csv_banco", async () => {
    const bytes = Uint8Array.from(
      [..."Data;Histórico;Valor\n02/10/2026;Padaria São João;-12,90\n"].map((c) => c.charCodeAt(0)),
    );
    const preview = await service.preview(file("extrato_santander.csv", bytes));
    expect(preview).toMatchObject({ source: "csv_banco", format: "csv", institution: "Santander" });
    expect(summary(preview.rows)).toEqual([["2026-10-02", "Padaria São João", "12.90", "despesa"]]);
  });

  it("OFX pela extensão ou pelo conteúdo", async () => {
    const byName = await service.preview(file("extrato.ofx", utf8(ofxSgml)));
    expect(byName).toMatchObject({ source: "ofx", format: "ofx", institution: "Itaú", kind: "conta" });
    const byContent = await service.preview(file("download", utf8(ofxXml)));
    expect(byContent).toMatchObject({ source: "ofx", kind: "cartao" });
  });

  it("CSV sem colunas reconhecíveis → 400 explicando o que falta", async () => {
    await expect(service.preview(file("planilha.csv", utf8("a;b;c\n1;2;3\n")))).rejects.toMatchObject({
      status: 400,
      details: [{ path: "file", message: expect.stringMatching(/data, descrição e valor/) }],
    });
  });
});

describe("PicPay", () => {
  it("CSV: tipo + origem/destino na descrição, valor com sinal e R$, cofrinho sugerido para não importar", () => {
    const csv = [
      'data,hora,tipo,"origem / destino",valor,"forma de pagamento"',
      '2026-11-19,18:16,"Pix enviado","MERCADO EXEMPLO","−R$ 21,57","Com saldo"',
      '2026-11-14,23:20,"Pix recebido","FULANO DE TAL","+R$ 3,00",',
      '2026-11-12,23:04,"Dinheiro resgatado","Do cofrinho Reserva","+R$ 581,54",',
      '2026-11-07,15:45,"Dinheiro guardado","No cofrinho Reserva","−R$ 1.065,51","Com saldo"',
      '2026-11-06,10:47,"Pagamento realizado","OPERADORA TELEFONE","−R$ 54,00","Com saldo"',
      "",
    ].join("\n");
    const result = parseBankCsv(csv, "extrato-2026-10-24-2026-11-22.csv");
    expect(result).toMatchObject({ institution: "PicPay", kind: "conta", errors: [] });
    expect(summary(result?.rows ?? [])).toEqual([
      ["2026-11-19", "Pix enviado — MERCADO EXEMPLO", "21.57", "despesa"],
      ["2026-11-14", "Pix recebido — FULANO DE TAL", "3.00", "receita"],
      ["2026-11-12", "Dinheiro resgatado — Do cofrinho Reserva", "581.54", "receita"],
      ["2026-11-07", "Dinheiro guardado — No cofrinho Reserva", "1065.51", "despesa"],
      ["2026-11-06", "Pagamento realizado — OPERADORA TELEFONE", "54.00", "despesa"],
    ]);
    expect(result?.rows.map((r) => r.suggestedSkip)).toEqual([false, false, true, true, false]);
    expect(result?.rows[2]?.note).toMatch(/reserva do banco/);
  });

  const header = (top: number): PdfText[] => [
    row(44, top, "Hora"),
    row(121, top, "Tipo"),
    row(243, top, "Origem / Destino"),
    row(351, top, "Forma de pagamento"),
    row(530, top, "Valor"),
  ];
  const footer = (page: number): PdfText[] => [row(136, 784, "PicPay Serviços S/A"), row(539, 800, `${page} de 2`)];
  const extrato: PdfText[][] = [
    [
      row(31, 115, "Extrato de conta"),
      row(31, 145, "Período"),
      row(225, 145, "Saldo final do período"),
      row(32, 167, "24 de outubro de 2026 a"),
      row(225, 167, "R$ 285,60"),
      row(32, 181, "22 de novembro de 2026"),
      row(44, 227, "19 de novembro 2026"),
      row(434, 227, "Saldo ao final do dia:"),
      row(511, 227, "R$ 285,60"),
      ...header(260),
      row(44, 295, "18:16"),
      row(121, 295, "Pix enviado"),
      row(243, 295, "MERCADO EXEMPLO"),
      row(351, 295, "Com saldo"),
      row(514, 295, "-R$ 21,57"),
      // origem/destino quebrado acima e abaixo da linha da hora
      row(243, 441, "FULANA DE TAL"),
      row(44, 446, "23:19"),
      row(121, 446, "Pix recebido"),
      row(517, 446, "+R$ 9,43"),
      row(243, 450, "DA SILVA"),
      ...footer(1),
    ],
    [
      row(44, 116, "07 de novembro 2026"),
      row(435, 116, "Saldo ao final do dia:"),
      row(512, 116, "R$ 123,43"),
      ...header(149),
      row(243, 323, "No cofrinho Reserva de"),
      row(44, 328, "15:45"),
      row(121, 328, "Dinheiro guardado"),
      row(351, 328, "Com saldo"),
      row(502, 328, "-R$ 1.065,51"),
      row(243, 332, "emergência"),
      ...footer(2),
    ],
  ];

  it("PDF: período, dia de cada bloco, origem/destino em várias linhas e cofrinho", async () => {
    const pdfService = createImportPreviewService({ extractPdfLines });
    const preview = await pdfService.preview(file("extrato.pdf", makePdf(extrato), "application/pdf"));
    expect(preview).toMatchObject({
      source: "picpay_extrato",
      format: "pdf",
      institution: "PicPay",
      kind: "conta",
      period: { start: "2026-10-24", end: "2026-11-22" },
      errors: [],
    });
    expect(summary(preview.rows)).toEqual([
      ["2026-11-19", "Pix enviado — MERCADO EXEMPLO", "21.57", "despesa"],
      ["2026-11-19", "Pix recebido — FULANA DE TAL DA SILVA", "9.43", "receita"],
      ["2026-11-07", "Dinheiro guardado — No cofrinho Reserva de emergência", "1065.51", "despesa"],
    ]);
    expect(preview.rows.map((r) => r.suggestedSkip)).toEqual([false, false, true]);
  });
});
