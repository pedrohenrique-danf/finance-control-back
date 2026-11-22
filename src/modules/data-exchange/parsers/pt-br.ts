// Conversões de texto em pt-BR usadas pelos parsers de importação (funções puras).
import { isRealCalendarDate } from "@/shared/dates";

const pad = (n: number) => String(n).padStart(2, "0");

/** "JAN".."DEZ" → 1..12 (abreviações dos extratos do Nubank). */
export const MONTH_ABBREVIATIONS: Readonly<Record<string, number>> = {
  JAN: 1,
  FEV: 2,
  MAR: 3,
  ABR: 4,
  MAI: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SET: 9,
  OUT: 10,
  NOV: 11,
  DEZ: 12,
};

/** Nomes completos ("OUTUBRO") → 1..12, sem acento. */
export const MONTH_NAMES: Readonly<Record<string, number>> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

export const MONTH_ABBREVIATION_PATTERN = Object.keys(MONTH_ABBREVIATIONS).join("|");

/** Remove acentos e padroniza em maiúsculas (comparações tolerantes). */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
}

/** ISO "YYYY-MM-DD" a partir de partes; null se a data não existe. */
export function isoDate(year: number, month: number, day: number): string | null {
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  return isRealCalendarDate(iso) ? iso : null;
}

/**
 * Valor pt-BR → { amount (positivo, "1234.56"), negative }.
 * Aceita "1.447,00", "R$ 48,49", "-R$ 2.953,93", "−R$ 2.953,93", "+ 3.687,11", "- 3.453,93".
 */
export function parseBrlAmount(text: string): { amount: string; negative: boolean } | null {
  const match = /^([+\-−–])?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/.exec(text.trim().replace(/ /g, " "));
  if (!match) return null;
  const [, sign, integer = "", cents = ""] = match;
  const normalizedInteger = integer.replace(/\./g, "").replace(/^0+(?=\d)/, "");
  return { amount: `${normalizedInteger}.${cents}`, negative: sign !== undefined && sign !== "+" };
}

/** Termina com um valor pt-BR? Devolve o valor e o texto antes dele. */
export function splitTrailingAmount(text: string): { before: string; value: string } | null {
  const match = /^(.*?)\s*((?:[+\-−–]\s*)?(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/.exec(text.trim());
  if (!match) return null;
  return { before: match[1]?.trim() ?? "", value: match[2] ?? "" };
}

/** "dd/mm/aaaa" ou "aaaa-mm-dd" → ISO; null se inválida. */
export function parseCsvDate(text: string): string | null {
  const value = text.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (br) return isoDate(Number(br[3]), Number(br[2]), Number(br[1]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}
