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

/**
 * Valor em qualquer formato comum de arquivo de banco → { amount (positivo, "1234.56"), negative }.
 * Aceita "1.234,56", "1234.56", "1,234.56", "-50,00", "50,00-", "(50,00)", "R$ -1.234,56", "1234" e
 * "12,5". Com um só separador seguido de exatamente 3 dígitos ("1.234", "1,234"), lê como milhar; com os
 * dois separadores, o último é o decimal e casas além da segunda são arredondadas.
 */
export function parseFlexibleAmount(text: string): { amount: string; negative: boolean } | null {
  let value = text.trim().replace(/[\s ]/g, "");
  if (value === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  value = value.replace(/^R\$/i, "");
  const leading = /^([+\-−–])/.exec(value);
  if (leading) {
    negative = negative || leading[1] !== "+";
    value = value.slice(1);
  }
  value = value.replace(/^R\$/i, "");
  const trailing = /([+\-−–])$/.exec(value);
  if (trailing) {
    negative = negative || trailing[1] !== "+";
    value = value.slice(0, -1);
  }
  if (!/^\d[\d.,]*$/.test(value) || /[.,]$/.test(value)) return null;

  const lastDot = value.lastIndexOf(".");
  const lastComma = value.lastIndexOf(",");
  let integer: string;
  let decimals = "";
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    const thousands = decimalAt === lastDot ? "," : ".";
    integer = value.slice(0, decimalAt);
    decimals = value.slice(decimalAt + 1);
    if (integer.includes(value[decimalAt] ?? "")) return null; // separador decimal repetido
    if (!new RegExp(`^\\d{1,3}(?:\\${thousands}\\d{3})*$`).test(integer)) return null;
    integer = integer.split(thousands).join("");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? "." : ",";
    const parts = value.split(separator);
    const last = parts.at(-1) ?? "";
    if (parts.length === 2 && last.length !== 3) {
      integer = parts[0] ?? "";
      decimals = last;
    } else if (/^\d{1,3}$/.test(parts[0] ?? "") && parts.slice(1).every((p) => p.length === 3)) {
      integer = parts.join(""); // "1.234" ou "1.234.567": milhar
    } else return null;
  } else integer = value;
  if (!/^\d+$/.test(integer) || !/^\d*$/.test(decimals)) return null;

  const cents = Math.round(Number(`0.${decimals || "0"}`) * 100);
  let whole = BigInt(integer);
  let rest = cents;
  if (rest === 100) {
    whole += 1n;
    rest = 0;
  }
  return { amount: `${whole}.${pad(rest)}`, negative };
}

/**
 * Data de arquivo de banco → ISO. Aceita "dd/mm/aaaa", "dd/mm/aa", "dd-mm-aaaa", "dd.mm.aaaa", "aaaa-mm-dd",
 * "aaaa/mm/dd" e "aaaammdd", com ou sem hora depois ("05/11/2026 10:22", "2026-11-05T10:22:00").
 */
export function parseFlexibleDate(text: string): string | null {
  const value = text.trim().replace(/[T\s].*$/, "");
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(value);
  if (dmy) {
    const year = Number(dmy[3]);
    return isoDate(year < 100 ? 2000 + year : year, Number(dmy[2]), Number(dmy[1]));
  }
  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (ymd) return isoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  return null;
}

/**
 * Texto de um arquivo enviado: UTF-8 quando válido; senão Windows-1252 (padrão dos arquivos exportados por
 * bancos tradicionais e pelo Excel em português). Remove o BOM.
 */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}
