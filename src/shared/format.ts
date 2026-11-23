// Formatação pt-BR para textos gerados no servidor (notificações). A API devolve dados crus (string decimal, ISO).

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const plain = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "1234.50" → "R$ 1.234,50" (espaço comum após "R$"). */
export function formatBrl(amount: string): string {
  return brl.format(Number(amount)).replace(/\s/g, " ");
}

/** "1234.50" → "1.234,50" (CSV padrão Excel pt-BR). */
export function formatDecimalBr(amount: string): string {
  return plain.format(Number(amount));
}

/** "2026-11-05" → "05/11/2026". */
export function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-11" → "Novembro 2026". */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1] ?? ""} ${y}`;
}

/** 1 → "1 transação", 3 → "3 transações". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
