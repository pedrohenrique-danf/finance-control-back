import type { ImportRow, ImportRowError, ParsedStatement, PdfLine } from "../import.types";
import { INTERNAL_TRANSFER_NOTE, isInternalTransfer } from "./internal-transfers";
import { lineText } from "./nubank-card";
import { fold, isoDate, MONTH_NAMES, parseFlexibleAmount } from "./pt-br";

// Extrato de conta do PicPay (PDF). Layout de referência (um bloco por dia, do mais recente ao mais antigo):
//   Extrato de conta
//   Período                         Saldo final do período
//   24 de outubro de 2026 a         R$ 285,60
//   22 de novembro de 2026
//   19 de novembro 2026                               Saldo ao final do dia: R$ 285,60
//   Hora   Tipo                Origem / Destino      Forma de pagamento        Valor
//   18:16  Pix enviado         SUPERMERCADO X        Com saldo            −R$ 21,57
//                              NOME QUE QUEBRA
//   23:19  Pix enviado         EM DUAS LINHAS        Com saldo             −R$ 9,43
// Origem/destino longo quebra em linhas acima e abaixo da linha da hora; o sinal do valor define a direção.

const MONTHS = Object.keys(MONTH_NAMES).join("|");
const PERIOD = new RegExp(
  // O saldo final do período fica na mesma linha do início do período: "24 de outubro de 2026 a R$ 285,60".
  `(\\d{1,2}) DE (${MONTHS}) DE (\\d{4}) A (?:[+\\-−–]?\\s*R\\$\\s*[\\d.]+,\\d{2}\\s+)?(\\d{1,2}) DE (${MONTHS}) DE (\\d{4})`,
);
const DAY = new RegExp(`^(\\d{1,2}) DE (${MONTHS}) (?:DE )?(\\d{4})\\b`);
const TIME = /^\d{1,2}:\d{2}$/;
const AMOUNT = /^[+\-−–]?\s*R\$\s*[\d.]+,\d{2}$/;
/** Distância vertical máxima (pt) entre a linha da hora e as linhas quebradas da origem/destino. */
const WRAP_GAP = 12;

export function isPicPayAccountStatement(lines: readonly PdfLine[]): boolean {
  const text = fold(lines.map(lineText).join("\n"));
  return text.includes("PICPAY") && text.includes("SALDO AO FINAL DO DIA") && text.includes("ORIGEM / DESTINO");
}

/** Colunas pelo cabeçalho "Hora Tipo Origem / Destino Forma de pagamento Valor" (posições x). */
interface Columns {
  type: number;
  party: number;
  payment: number;
  amount: number;
}
const DEFAULT_COLUMNS: Columns = { type: 110, party: 235, payment: 345, amount: 480 };

function headerColumns(line: PdfLine): Columns | null {
  const find = (label: string) => line.cells.find((c) => fold(c.text).trim() === label)?.x;
  const type = find("TIPO");
  const party = find("ORIGEM / DESTINO");
  const payment = find("FORMA DE PAGAMENTO");
  if (type === undefined || party === undefined || payment === undefined) return null;
  // Valor é alinhado à direita: a coluna começa um pouco depois do fim da forma de pagamento.
  return { type: type - 8, party: party - 8, payment: payment - 8, amount: payment + 120 };
}

interface Draft {
  index: number;
  page: number;
  top: number;
  date: string;
  kind: string;
  party: string[];
  amount: string;
  negative: boolean;
}

export function parsePicPayAccountStatement(lines: readonly PdfLine[]): ParsedStatement {
  const texts = lines.map(lineText);
  const periodMatch = PERIOD.exec(fold(texts.join(" ")));
  let period: ParsedStatement["period"] = null;
  if (periodMatch) {
    const start = isoDate(Number(periodMatch[3]), MONTH_NAMES[periodMatch[2] ?? ""] ?? 0, Number(periodMatch[1]));
    const end = isoDate(Number(periodMatch[6]), MONTH_NAMES[periodMatch[5] ?? ""] ?? 0, Number(periodMatch[4]));
    if (start && end) period = { start, end };
  }

  const drafts: Draft[] = [];
  const wrapped: Array<{ page: number; top: number; text: string }> = [];
  const errors: ImportRowError[] = [];
  let columns = DEFAULT_COLUMNS;
  let date: string | null = null;

  lines.forEach((line, index) => {
    const folded = fold(texts[index] ?? "");
    const day = DAY.exec(folded);
    if (day) {
      date = isoDate(Number(day[3]), MONTH_NAMES[day[2] ?? ""] ?? 0, Number(day[1]));
      return;
    }
    const header = headerColumns(line);
    if (header) {
      columns = header;
      return;
    }
    const first = line.cells[0];
    const inColumn = (x: number, from: number, to: number) => x >= from && x < to;
    if (first && TIME.test(first.text.trim())) {
      const kind = line.cells.filter((c) => inColumn(c.x, columns.type, columns.party)).map((c) => c.text);
      const party = line.cells.filter((c) => inColumn(c.x, columns.party, columns.payment)).map((c) => c.text);
      const amountCell = [...line.cells].reverse().find((c) => AMOUNT.test(c.text.trim()));
      const money = amountCell ? parseFlexibleAmount(amountCell.text) : null;
      if (!date || !money || kind.length === 0) {
        errors.push({
          line: index + 1,
          field: null,
          message: "Lançamento do extrato não reconhecido.",
          content: texts[index] ?? null,
        });
        return;
      }
      drafts.push({
        index: index + 1,
        page: line.page,
        top: line.top,
        date,
        kind: kind.join(" "),
        party,
        amount: money.amount,
        negative: money.negative,
      });
      return;
    }
    // Linha só com texto na coluna origem/destino: pedaço quebrado de um lançamento vizinho.
    if (line.cells.every((c) => inColumn(c.x, columns.party, columns.payment))) {
      wrapped.push({ page: line.page, top: line.top, text: texts[index] ?? "" });
    }
  });

  for (const piece of wrapped) {
    const owner = drafts
      .filter((d) => d.page === piece.page && Math.abs(d.top - piece.top) <= WRAP_GAP)
      .sort((a, b) => Math.abs(a.top - piece.top) - Math.abs(b.top - piece.top))[0];
    if (!owner) continue;
    if (piece.top < owner.top) owner.party.unshift(piece.text);
    else owner.party.push(piece.text);
  }

  const rows: ImportRow[] = drafts.map((d) => {
    const party = d.party.join(" ").replace(/\s+/g, " ").trim();
    const description = (party ? `${d.kind} — ${party}` : d.kind).slice(0, 160);
    const type = d.negative ? "despesa" : "receita";
    const internal = isInternalTransfer(description);
    return {
      line: d.index,
      date: d.date,
      description,
      amount: d.amount,
      type,
      nature: type === "despesa" ? "variavel" : null,
      status: "efetivada",
      categoryName: null,
      accountName: null,
      installment: null,
      suggestedSkip: internal,
      note: internal ? INTERNAL_TRANSFER_NOTE : null,
    };
  });
  return { period, rows, errors };
}
