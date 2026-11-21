import type { ImportRow, ImportRowError, PdfLine } from "../import.types";
import { lineText } from "./nubank-card";
import { fold, isoDate, MONTH_ABBREVIATION_PATTERN, MONTH_ABBREVIATIONS, MONTH_NAMES, parseBrlAmount } from "./pt-br";

// Extrato da conta do Nubank (PDF). Layout de referência:
//   01 DE OUTUBRO DE 2026 a 31 DE OUTUBRO DE 2026
//   Movimentações
//   07 OUT 2026   Total de entradas                                        + 3.687,11
//                 Transferência recebida pelo Pix     FULANO DE TAL            1.447,00
//                                                     CPF •••.123.456-••
//                 Valor adicionado na conta por       Valor adicionado para…     500,00
//                 cartão de crédito
//                 Total de saídas                                          - 3.453,93
//                 Pagamento de fatura                                       2.953,93
// O bloco ("Total de entradas"/"Total de saídas") define receita/despesa dos itens seguintes.

const PERIOD = /(\d{1,2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})\s+A\s+(\d{1,2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})/;
const DAY = new RegExp(`^(\\d{2})\\s+(${MONTH_ABBREVIATION_PATTERN})\\s+(\\d{4})\\b`);
const AMOUNT_CELL = /^(?:[+\-−–]\s*)?(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/;
/** Rodapés, cabeçalhos repetidos e resumo do período: nunca viram nem continuam um item. */
const NOISE =
  /^(SALDO INICIAL|SALDO FINAL|RENDIMENTO|TOTAL DE ENTRADAS|TOTAL DE SAIDAS|MOVIMENTACOES|VALORES EM|TEM ALGUMA DUVIDA|OUVIDORIA|NU PAGAMENTOS|NU FINANCEIRA|CNPJ|AGENCIA\b|CONTA:|EXTRATO GERADO|ASSINADO|\d+\s+DE\s+\d+$)/;

/** Distância máxima (pt) entre linhas de um mesmo item. */
const CONTINUATION_GAP = 30;
/** Tolerância (pt) para considerar duas células na mesma coluna. */
const COLUMN_TOLERANCE = 12;

export function isNubankAccountStatement(lines: readonly PdfLine[]): boolean {
  const text = fold(lines.map(lineText).join("\n"));
  return text.includes("MOVIMENTACOES") && (text.includes("TOTAL DE ENTRADAS") || text.includes("TOTAL DE SAIDAS"));
}

interface Draft {
  index: number;
  page: number;
  lastTop: number;
  date: string;
  type: "receita" | "despesa";
  amount: string;
  labelX: number;
  label: string[];
  detail: string[];
}

/** Agrupa células vizinhas em colunas (espaço horizontal grande separa colunas). */
function columns(line: PdfLine): Array<{ x: number; text: string }> {
  const out: Array<{ x: number; right: number; text: string }> = [];
  for (const cell of [...line.cells].sort((a, b) => a.x - b.x)) {
    const text = cell.text.trim();
    if (!text) continue;
    const last = out.at(-1);
    if (last && cell.x - last.right < 14) {
      last.text = `${last.text} ${text}`;
      last.right = cell.x + cell.width;
    } else out.push({ x: cell.x, right: cell.x + cell.width, text });
  }
  return out.map(({ x, text }) => ({ x, text }));
}

function finish(draft: Draft): ImportRow {
  const label = draft.label.join(" ").replace(/\s+/g, " ").trim();
  const detail = draft.detail.join(" ").replace(/\s+/g, " ").trim();
  const description = (detail ? `${label} — ${detail}` : label).slice(0, 160);
  const folded = fold(label);
  const isCardPayment = folded.startsWith("PAGAMENTO DE FATURA");
  return {
    line: draft.index,
    date: draft.date,
    description,
    amount: draft.amount,
    type: draft.type,
    nature: draft.type === "despesa" ? "variavel" : null,
    status: "efetivada",
    categoryName: null,
    accountName: null,
    installment: null,
    suggestedSkip: false,
    note: isCardPayment
      ? "Pagamento de fatura: se importar também a fatura do cartão, as compras já estarão lá."
      : null,
  };
}

export function parseNubankAccountStatement(lines: readonly PdfLine[]): {
  period: { start: string; end: string } | null;
  rows: ImportRow[];
  errors: ImportRowError[];
} {
  let period: { start: string; end: string } | null = null;
  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  let date: string | null = null;
  let type: "receita" | "despesa" | null = null;
  let draft: Draft | null = null;
  const flush = () => {
    if (draft) rows.push(finish(draft));
    draft = null;
  };

  lines.forEach((line, i) => {
    const text = lineText(line);
    const folded = fold(text);

    const periodMatch = PERIOD.exec(folded);
    if (periodMatch && !period) {
      const start = isoDate(Number(periodMatch[3]), MONTH_NAMES[periodMatch[2] ?? ""] ?? 0, Number(periodMatch[1]));
      const end = isoDate(Number(periodMatch[6]), MONTH_NAMES[periodMatch[5] ?? ""] ?? 0, Number(periodMatch[4]));
      if (start && end) period = { start, end };
      return;
    }

    let cols = columns(line);
    const day = DAY.exec(folded);
    if (day) {
      flush();
      type = null; // cada dia começa com "Total de entradas" ou "Total de saídas"
      date = isoDate(Number(day[3]), MONTH_ABBREVIATIONS[day[2] ?? ""] ?? 0, Number(day[1]));
      if (!date) errors.push({ line: i + 1, field: "data", message: "Data do extrato inválida.", content: text });
      // Tira só o prefixo da data da primeira coluna (o PDF pode juntar a data e "Total de entradas").
      const [first, ...others] = cols;
      const remainder = first ? first.text.replace(/^\s*\d{2}\s+\S{3}\s+\d{4}\s*/, "") : "";
      cols = first && remainder ? [{ x: first.x, text: remainder }, ...others] : others;
    }
    const rest = fold(cols.map((c) => c.text).join(" "));
    if (rest.startsWith("TOTAL DE ENTRADAS")) {
      flush();
      type = "receita";
      return;
    }
    if (rest.startsWith("TOTAL DE SAIDAS")) {
      flush();
      type = "despesa";
      return;
    }
    if (!cols.length || NOISE.test(rest) || !date || !type) {
      if (cols.length) flush();
      return;
    }

    const last = cols.at(-1);
    const hasAmount = last !== undefined && AMOUNT_CELL.test(last.text) && cols.length >= 2;
    if (hasAmount && last) {
      flush();
      const money = parseBrlAmount(last.text);
      const [labelCol, ...detailCols] = cols.slice(0, -1);
      if (!money || !labelCol) {
        errors.push({ line: i + 1, field: "valor", message: "Valor do lançamento não reconhecido.", content: text });
        return;
      }
      draft = {
        index: i + 1,
        page: line.page,
        lastTop: line.top,
        date,
        type,
        amount: money.amount,
        labelX: labelCol.x,
        label: [labelCol.text],
        detail: detailCols.map((c) => c.text),
      };
      return;
    }

    // Continuação: mesma página, logo abaixo do item; coluna da esquerda continua o tipo, o resto é detalhe.
    const current: Draft | null = draft;
    if (current && line.page === current.page && line.top - current.lastTop <= CONTINUATION_GAP) {
      for (const col of cols) {
        if (Math.abs(col.x - current.labelX) <= COLUMN_TOLERANCE) current.label.push(col.text);
        else current.detail.push(col.text);
      }
      current.lastTop = line.top;
      return;
    }
    flush();
  });
  flush();
  return { period, rows, errors };
}
