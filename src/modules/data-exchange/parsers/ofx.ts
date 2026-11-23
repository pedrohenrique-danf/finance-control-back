import { MIN_DATE, maxTransactionDate } from "@/shared/schemas";
import type { ImportRow, ImportRowError, StatementKind } from "../import.types";
import { MAX_ROWS } from "./csv";
import { institutionFromCode, institutionFromText } from "./institutions";
import { fold, parseFlexibleAmount, parseFlexibleDate } from "./pt-br";

// OFX (Open Financial Exchange), exportado pela maioria dos bancos (Itaú, Bradesco, BB, Caixa, Santander,
// Inter, Nubank, C6...). Duas variantes:
//   - OFX 1.x (SGML): cabeçalho "OFXHEADER:100" e tags de valor sem fechamento ("<TRNAMT>-50.00");
//   - OFX 2.x (XML): mesmas tags, com fechamento.
// Cada lançamento fica em <STMTTRN> ... </STMTTRN>. O sinal de TRNAMT define a direção (negativo = saída),
// tanto no extrato (<STMTRS>) quanto na fatura do cartão (<CCSTMTRS>).

const BLOCK = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
const CARD_PAYMENT = /^(PAGAMENTO( (RECEBIDO|EFETUADO|DE FATURA|DA FATURA|FATURA))?|PGTO\b|PAGTO\b)/;
const INSTALLMENT = /PARCELA\s+(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})/;

/** Arquivo OFX? Pelo cabeçalho SGML, pela declaração XML ou pela tag raiz. */
export function isOfx(text: string): boolean {
  const head = text.slice(0, 2000).toUpperCase();
  return head.includes("OFXHEADER") || /<OFX>/.test(head);
}

/** Valor da tag (com ou sem fechamento); entidades XML básicas decodificadas. */
function tag(block: string, name: string): string {
  const match = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  return (match?.[1] ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** "20261005", "20261005120000[-3:BRT]" → "2026-10-05". */
function ofxDate(value: string): string | null {
  const match = /^(\d{8})/.exec(value.trim());
  return match ? parseFlexibleDate(match[1] ?? "") : null;
}

export interface OfxResult {
  institution: string | null;
  kind: StatementKind | null;
  period: { start: string; end: string } | null;
  rows: ImportRow[];
  errors: ImportRowError[];
}

export function parseOfx(text: string, fileName = ""): OfxResult {
  const kind: StatementKind | null = /<CCSTMTRS>/i.test(text) ? "cartao" : /<STMTRS>/i.test(text) ? "conta" : null;
  const institution =
    institutionFromCode(tag(text, "BANKID")) ??
    institutionFromText(tag(text, "ORG")) ??
    institutionFromText(fileName.replace(/\.[a-z]+$/i, ""));

  const start = ofxDate(tag(text, "DTSTART"));
  const end = ofxDate(tag(text, "DTEND"));
  const period = start && end && end >= start ? { start, end } : null;

  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  let index = 0;
  for (const match of text.matchAll(BLOCK)) {
    index++;
    const block = match[1] ?? "";
    if (rows.length >= MAX_ROWS) {
      errors.push({
        line: index,
        field: null,
        message: `Limite de ${MAX_ROWS} lançamentos por arquivo.`,
        content: null,
      });
      break;
    }
    const memo = tag(block, "MEMO");
    const name = tag(block, "NAME");
    const contains = (a: string, b: string) => fold(a).includes(fold(b));
    const description = (
      memo && name && !contains(memo, name) && !contains(name, memo) ? `${name} — ${memo}` : memo || name
    ).slice(0, 160);
    const date = ofxDate(tag(block, "DTPOSTED"));
    const money = parseFlexibleAmount(tag(block, "TRNAMT"));
    const content = block.replace(/\s+/g, " ").trim().slice(0, 500);

    const errorsBefore = errors.length;
    const fail = (field: string, message: string) => errors.push({ line: index, field, message, content });
    if (!date) fail("data", "Data inválida (DTPOSTED).");
    else if (date < MIN_DATE || date > maxTransactionDate()) {
      fail("data", "Data fora do intervalo (de 01/01/2000 até 1 ano a partir de hoje).");
    }
    if (!description) fail("descricao", "Lançamento sem descrição (MEMO/NAME).");
    if (!money) fail("valor", "Valor inválido (TRNAMT).");
    if (errors.length > errorsBefore || !date || !money) continue;
    if (Number(money.amount) === 0) continue;

    const type = money.negative ? "despesa" : "receita";
    const folded = fold(description);
    const isCardPayment = kind === "cartao" && type === "receita" && CARD_PAYMENT.test(folded);
    const installment = INSTALLMENT.exec(folded);
    rows.push({
      line: index,
      date,
      description,
      amount: money.amount,
      type,
      nature: type === "despesa" ? "variavel" : null,
      status: "efetivada",
      categoryName: null,
      accountName: null,
      installment: installment ? `${installment[1]}/${installment[2]}` : null,
      suggestedSkip: isCardPayment,
      note: isCardPayment ? "Pagamento da fatura: já aparece como saída no extrato da conta." : null,
    });
  }
  if (index === 0) {
    errors.push({ line: 0, field: null, message: "Nenhum lançamento (<STMTTRN>) encontrado no OFX.", content: null });
  }
  return { institution, kind, period, rows, errors };
}
