import type { ImportRow, ImportRowError, PdfLine } from "../import.types";
import {
  fold,
  isoDate,
  MONTH_ABBREVIATION_PATTERN,
  MONTH_ABBREVIATIONS,
  parseBrlAmount,
  splitTrailingAmount,
} from "./pt-br";

// Fatura do cartão de crédito do Nubank (PDF). Layout de referência:
//   Data de vencimento: 09 NOV 2026
//   Período vigente: 30 SET a 31 OUT
//   30 SET  [▯] •••• 1234  Amazon Marketplace - Parcela 4/6        R$ 48,49
//   01 OUT  [▯] •••• 1234  Coffee House.                            R$ 8,50
// Resumo (Fatura anterior, Pagamento recebido, Total a pagar…) não começa com data e é ignorado.

const DUE_DATE = new RegExp(`DATA DE VENCIMENTO:?\\s*(\\d{2})\\s+(${MONTH_ABBREVIATION_PATTERN})\\s+(\\d{4})`);
const PERIOD = new RegExp(
  `PERIODO VIGENTE:?\\s*(\\d{2})\\s+(${MONTH_ABBREVIATION_PATTERN})\\s+A\\s+(\\d{2})\\s+(${MONTH_ABBREVIATION_PATTERN})`,
);
const ROW_DATE = new RegExp(`^(\\d{2})\\s+(${MONTH_ABBREVIATION_PATTERN})\\b\\s*(.*)$`);
/** Máscara do cartão ("•••• 1234", "**** 1234") e ícones soltos antes da descrição. */
const CARD_MASK = /^(?:[^\p{L}\p{N}]*\s)?(?:[•*·.]{2,}\s*\d{0,4})\s*/u;
const INSTALLMENT = /PARCELA\s+(\d{1,2})\s*\/\s*(\d{1,2})/i;

export function lineText(line: PdfLine): string {
  return line.cells
    .map((c) => c.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNubankCardStatement(lines: readonly PdfLine[]): boolean {
  const text = fold(lines.map(lineText).join("\n"));
  return DUE_DATE.test(text) && (PERIOD.test(text) || text.includes("TOTAL A PAGAR"));
}

/** Ano de um "DD MMM" da fatura: meses depois do vencimento são do ano anterior (fatura de dez/jan). */
function yearFor(month: number, due: { month: number; year: number }): number {
  return month > due.month ? due.year - 1 : due.year;
}

export function parseNubankCardStatement(lines: readonly PdfLine[]): {
  period: { start: string; end: string } | null;
  rows: ImportRow[];
  errors: ImportRowError[];
} {
  const texts = lines.map(lineText);
  const folded = texts.map(fold);
  const dueMatch = folded.map((t) => DUE_DATE.exec(t)).find(Boolean);
  if (!dueMatch) {
    return {
      period: null,
      rows: [],
      errors: [{ line: 0, field: null, message: "Data de vencimento da fatura não encontrada.", content: null }],
    };
  }
  const due = { month: MONTH_ABBREVIATIONS[dueMatch[2] ?? ""] ?? 1, year: Number(dueMatch[3]) };

  let period: { start: string; end: string } | null = null;
  const periodMatch = folded.map((t) => PERIOD.exec(t)).find(Boolean);
  if (periodMatch) {
    const startMonth = MONTH_ABBREVIATIONS[periodMatch[2] ?? ""] ?? 1;
    const endMonth = MONTH_ABBREVIATIONS[periodMatch[4] ?? ""] ?? 1;
    const start = isoDate(yearFor(startMonth, due), startMonth, Number(periodMatch[1]));
    const end = isoDate(yearFor(endMonth, due), endMonth, Number(periodMatch[3]));
    if (start && end) period = { start, end };
  }

  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  texts.forEach((text, index) => {
    const dated = ROW_DATE.exec(fold(text));
    if (!dated) return;
    const trailing = splitTrailingAmount(text);
    if (!trailing) return; // linha com data mas sem valor (ex.: cabeçalho de seção)
    const money = parseBrlAmount(trailing.value);
    const month = MONTH_ABBREVIATIONS[dated[2] ?? ""] ?? 0;
    const date = isoDate(yearFor(month, due), month, Number(dated[1]));
    // Descrição = texto original entre a data ("30 SET") e o valor, sem a máscara do cartão.
    const description = trailing.before.slice(6).replace(CARD_MASK, "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!money || !date || !description) {
      errors.push({ line: index + 1, field: null, message: "Lançamento da fatura não reconhecido.", content: text });
      return;
    }
    const installment = INSTALLMENT.exec(description);
    const isPayment = /^PAGAMENTO\b/.test(fold(description));
    rows.push({
      line: index + 1,
      date,
      description,
      amount: money.amount,
      // Compra = despesa; valor negativo na fatura = estorno/crédito = receita.
      type: money.negative ? "receita" : "despesa",
      nature: money.negative ? null : "variavel",
      status: "efetivada",
      categoryName: null,
      accountName: null,
      installment: installment ? `${installment[1]}/${installment[2]}` : null,
      suggestedSkip: isPayment,
      note: isPayment ? "Pagamento da fatura: já aparece como saída no extrato da conta." : null,
    });
  });
  return { period, rows, errors };
}
