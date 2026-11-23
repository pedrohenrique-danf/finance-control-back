import { MIN_DATE, maxTransactionDate } from "@/shared/schemas";
import type { ImportRow, ImportRowError, StatementKind } from "../import.types";
import { MAX_ROWS, splitCsvLine } from "./csv";
import { institutionFromText } from "./institutions";
import { fold, parseFlexibleAmount, parseFlexibleDate } from "./pt-br";

// CSV exportado por bancos e carteiras digitais. Não há um padrão: cada banco usa seu separador, sua
// codificação, seus nomes de coluna e às vezes linhas de cabeçalho antes da tabela. O leitor:
//   1. testa os separadores ; , tab e | e procura, nas primeiras linhas, a linha de cabeçalho que tem uma
//      coluna de data e uma de valor (ou débito/crédito);
//   2. reconhece as colunas pelo nome, com sinônimos (data/date/data lançamento, descrição/histórico/title...);
//   3. lê datas e valores em formatos variados e deduz receita/despesa pelo sinal, por colunas de
//      débito/crédito separadas ou por uma coluna de tipo (D/C, entrada/saída...).
// Exemplos cobertos pelos testes:
//   Nubank conta:   Data,Valor,Identificador,Descrição            05/10/2026,-50.00,<uuid>,Compra no débito
//   Nubank cartão:  date,title,amount                             2026-10-05,Padaria,12.90   (positivo = compra)
//   Inter:          Extrato Conta Corrente / Conta ;... / Data Lançamento;Histórico;Descrição;Valor;Saldo
//   Débito/crédito: Data;Histórico;Débito;Crédito;Saldo

type Field = "date" | "description" | "detail" | "amount" | "debit" | "credit" | "direction" | "category";

/** Nomes de coluna aceitos (sem acento, minúsculas, sem pontuação), por ordem de preferência. */
const SYNONYMS: Readonly<Record<Field, readonly string[]>> = {
  date: [
    "data",
    "date",
    "data lancamento",
    "data de lancamento",
    "data do lancamento",
    "data movimento",
    "data da movimentacao",
    "data movimentacao",
    "data mov",
    "data transacao",
    "data da transacao",
    "data operacao",
    "data da compra",
    "data compra",
    "dt lancamento",
    "dt movimento",
    "release date",
    "transaction date",
  ],
  description: [
    "historico",
    "descricao",
    "title",
    "description",
    "lancamento",
    "lancamentos",
    "descricao do lancamento",
    "estabelecimento",
    "transacao",
    "detalhes",
    "memo",
    "transaction type",
  ],
  // Segunda coluna de texto (o Inter separa "Histórico" de "Descrição").
  detail: ["descricao", "detalhes", "complemento", "favorecido", "nome"],
  amount: [
    "valor",
    "amount",
    "value",
    "valor r",
    "valor rs",
    "valor em r",
    "valor brl",
    "valor lancamento",
    "valor do lancamento",
    "valor da transacao",
    "transaction net amount",
    "net amount",
    "quantia",
    "montante",
  ],
  debit: ["debito", "debitos", "saida", "saidas", "valor debito", "debito r"],
  credit: ["credito", "creditos", "entrada", "entradas", "valor credito", "credito r"],
  direction: ["tipo", "d c", "dc", "c d", "tipo de lancamento", "tipo transacao", "natureza", "operacao"],
  category: ["categoria", "category"],
};

const SEPARATORS = [";", ",", "\t", "|"] as const;
/** Linhas iniciais examinadas atrás do cabeçalho (há bancos com um bloco de resumo antes da tabela). */
const HEADER_SEARCH_LINES = 40;

/** Linhas de saldo, totais e rodapés: não são movimentações. */
const NOISE = /^(SALDO|S A L D O|TOTAL|SUBTOTAL|RESUMO|LANCAMENTOS FUTUROS|SALDO ANTERIOR|SDO\b)/;

const normalizeHeader = (text: string) =>
  fold(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

interface Layout {
  separator: string;
  headerIndex: number;
  columns: Partial<Record<Field, number>>;
  header: string[];
}

function mapColumns(header: string[]): Partial<Record<Field, number>> {
  const names = header.map(normalizeHeader);
  const columns: Partial<Record<Field, number>> = {};
  const used = new Set<number>();
  const order: Field[] = ["date", "amount", "debit", "credit", "description", "detail", "direction", "category"];
  for (const field of order) {
    for (const synonym of SYNONYMS[field]) {
      const position = names.findIndex((name, i) => !used.has(i) && name === synonym);
      if (position >= 0) {
        columns[field] = position;
        used.add(position);
        break;
      }
    }
  }
  // "Data" exata não encontrada: aceita a primeira coluna que começa com "data"/"dt" (ex.: "Data Lanç.").
  if (columns.date === undefined) {
    const position = names.findIndex((name, i) => !used.has(i) && /^(data|dt|date)\b/.test(name));
    if (position >= 0) {
      columns.date = position;
      used.add(position);
    }
  }
  return columns;
}

function findLayout(lines: readonly string[]): Layout | null {
  const limit = Math.min(lines.length, HEADER_SEARCH_LINES);
  for (let i = 0; i < limit; i++) {
    const line = lines[i] ?? "";
    for (const separator of SEPARATORS) {
      if (!line.includes(separator)) continue;
      const header = splitCsvLine(line, separator);
      if (header.length < 2) continue;
      const columns = mapColumns(header);
      const hasValue = columns.amount !== undefined || (columns.debit !== undefined && columns.credit !== undefined);
      if (columns.date !== undefined && hasValue && columns.description !== undefined) {
        return { separator, headerIndex: i, columns, header };
      }
    }
  }
  return null;
}

/** Fatura de cartão? Pelo cabeçalho do Nubank (date,title,amount) ou por palavras no início do arquivo. */
function detectKind(layout: Layout, preamble: string, fileName: string): StatementKind | null {
  const names = layout.header.map(normalizeHeader);
  if (names.join(",") === "date,title,amount") return "cartao";
  const text = fold(`${fileName} ${preamble}`);
  if (/\b(FATURA|CARTAO DE CREDITO|CREDIT CARD)\b/.test(text)) return "cartao";
  if (/\b(EXTRATO|CONTA CORRENTE|CONTA DIGITAL|CONTA PAGAMENTO|SALDO)\b/.test(text)) return "conta";
  return null;
}

function detectInstitution(layout: Layout, preamble: string, fileName: string): string | null {
  const names = layout.header.map(normalizeHeader).join(",");
  if (names === "date,title,amount" || names === "data,valor,identificador,descricao") return "Nubank";
  if (names.startsWith("release date,transaction type")) return "Mercado Pago";
  return institutionFromText(`${preamble}\n${fileName.replace(/\.[a-z]+$/i, "")}`);
}

/** Direção pela coluna de tipo: "D"/"C", "débito"/"crédito", "saída"/"entrada"... null se não reconhecida. */
function directionOf(raw: string): "receita" | "despesa" | null {
  const value = fold(raw).trim();
  if (/^(C|CR|CREDITO|ENTRADA|RECEITA|IN|CREDIT)$/.test(value)) return "receita";
  if (/^(D|DB|DEBITO|SAIDA|DESPESA|OUT|DEBIT)$/.test(value)) return "despesa";
  return null;
}

/** Linha de pagamento da fatura dentro da fatura: já aparece como saída no extrato da conta. */
const CARD_PAYMENT = /^(PAGAMENTO( (RECEBIDO|EFETUADO|DE FATURA|DA FATURA|FATURA))?|PGTO\b|PAGTO\b)/;
const INSTALLMENT = /(?:PARCELA\s+)?(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\s*$/;

export interface BankCsvResult {
  institution: string | null;
  kind: StatementKind | null;
  rows: ImportRow[];
  errors: ImportRowError[];
}

/** Lê o CSV de um banco; null quando não encontra a tabela de lançamentos (cabeçalho com data e valor). */
export function parseBankCsv(text: string, fileName = ""): BankCsvResult | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const layout = findLayout(lines);
  if (!layout) return null;
  const { separator, headerIndex, columns } = layout;
  const preamble = lines.slice(0, headerIndex).join("\n");
  const kind = detectKind(layout, preamble, fileName);
  const institution = detectInstitution(layout, preamble, fileName);
  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (raw.trim() === "" || raw.split(separator).every((c) => c.trim() === "")) continue;
    const lineNumber = i + 1;
    if (rows.length >= MAX_ROWS) {
      errors.push({
        line: lineNumber,
        field: null,
        message: `Limite de ${MAX_ROWS} linhas por arquivo.`,
        content: null,
      });
      break;
    }
    const cells = splitCsvLine(raw, separator);
    const get = (field: Field) => {
      const position = columns[field];
      return position === undefined ? "" : (cells[position] ?? "").trim();
    };
    const main = get("description");
    const detail = get("detail");
    const description = (detail && fold(detail) !== fold(main) ? (main ? `${main} — ${detail}` : detail) : main)
      .replace(/\s+/g, " ")
      .slice(0, 160);
    const dateText = get("date");

    // Saldos, totais e linhas sem data e sem valor (rodapés, subtítulos) são ignorados sem erro.
    if (NOISE.test(fold(description)) || NOISE.test(fold(dateText))) continue;

    let money: { amount: string; negative: boolean } | null = null;
    let fromColumns: "receita" | "despesa" | null = null;
    if (columns.amount !== undefined) money = parseFlexibleAmount(get("amount"));
    else {
      const debit = parseFlexibleAmount(get("debit"));
      const credit = parseFlexibleAmount(get("credit"));
      if (debit && Number(debit.amount) > 0) {
        money = { amount: debit.amount, negative: true };
        fromColumns = "despesa";
      } else if (credit && Number(credit.amount) > 0) {
        money = { amount: credit.amount, negative: false };
        fromColumns = "receita";
      } else if (debit || credit) money = { amount: "0.00", negative: false };
    }
    const date = parseFlexibleDate(dateText);
    if (!dateText && !money) continue;

    const errorsBefore = errors.length;
    const fail = (field: string, message: string) => errors.push({ line: lineNumber, field, message, content: raw });
    if (!date) fail("data", "Data inválida.");
    else if (date < MIN_DATE || date > maxTransactionDate()) {
      fail("data", "Data fora do intervalo (de 01/01/2000 até 1 ano a partir de hoje).");
    }
    if (!description) fail("descricao", "Descrição vazia.");
    if (!money) fail("valor", "Valor inválido.");
    if (errors.length > errorsBefore || !date || !money) continue;
    if (Number(money.amount) === 0) continue; // lançamento informativo, sem valor

    // Direção: colunas débito/crédito > coluna de tipo > sinal (na fatura, positivo é compra).
    const direction = fromColumns ?? directionOf(get("direction"));
    let type: "receita" | "despesa";
    if (direction) type = direction;
    else if (kind === "cartao") type = money.negative ? "receita" : "despesa";
    else type = money.negative ? "despesa" : "receita";

    const folded = fold(description);
    const isCardPayment = kind === "cartao" && type === "receita" && CARD_PAYMENT.test(folded);
    const installment = kind === "cartao" ? INSTALLMENT.exec(folded) : null;
    rows.push({
      line: lineNumber,
      date,
      description,
      amount: money.amount,
      type,
      nature: type === "despesa" ? "variavel" : null,
      status: "efetivada",
      categoryName: get("category") || null,
      accountName: null,
      installment:
        installment && Number(installment[1]) <= Number(installment[2]) ? `${installment[1]}/${installment[2]}` : null,
      suggestedSkip: isCardPayment,
      note: isCardPayment ? "Pagamento da fatura: já aparece como saída no extrato da conta." : null,
    });
  }
  return { institution, kind, rows, errors };
}
