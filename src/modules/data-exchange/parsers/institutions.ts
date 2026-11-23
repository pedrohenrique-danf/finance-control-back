import { fold } from "./pt-br";

// Identificação do banco pelo nome no arquivo (cabeçalho, nome do arquivo) ou pelo código COMPE (OFX).

interface Institution {
  name: string;
  /** Código COMPE (3 dígitos). */
  code: string;
  /** Padrão no texto já sem acento e em maiúsculas. */
  pattern: RegExp;
}

export const INSTITUTIONS: readonly Institution[] = [
  { name: "Nubank", code: "260", pattern: /\b(NUBANK|NU PAGAMENTOS)\b/ },
  { name: "Inter", code: "077", pattern: /\b(BANCO INTER|INTER\s*&?\s*CO|INTER)\b/ },
  { name: "C6 Bank", code: "336", pattern: /\bC6(\s*BANK)?\b/ },
  { name: "PicPay", code: "380", pattern: /\bPICPAY\b/ },
  { name: "Mercado Pago", code: "323", pattern: /\bMERCADO\s*PAGO\b/ },
  { name: "PagBank", code: "290", pattern: /\b(PAGBANK|PAGSEGURO)\b/ },
  { name: "Neon", code: "735", pattern: /\bNEON\b/ },
  { name: "BTG Pactual", code: "208", pattern: /\bBTG\b/ },
  { name: "Banco Original", code: "212", pattern: /\bBANCO ORIGINAL\b/ },
  { name: "Itaú", code: "341", pattern: /\bITAU\b/ },
  { name: "Bradesco", code: "237", pattern: /\bBRADESCO\b/ },
  { name: "Banco do Brasil", code: "001", pattern: /\b(BANCO DO BRASIL|BB S\.?A)\b/ },
  { name: "Caixa", code: "104", pattern: /\b(CAIXA ECONOMICA|CAIXA)\b/ },
  { name: "Santander", code: "033", pattern: /\bSANTANDER\b/ },
  { name: "Sicoob", code: "756", pattern: /\bSICOOB\b/ },
  { name: "Sicredi", code: "748", pattern: /\bSICREDI\b/ },
];

/** Banco citado no texto (o primeiro da lista que aparecer). */
export function institutionFromText(text: string): string | null {
  const folded = fold(text).replace(/[_]+/g, " ");
  return INSTITUTIONS.find((i) => i.pattern.test(folded))?.name ?? null;
}

/** Banco pelo código COMPE ("341", "0341", "1"). */
export function institutionFromCode(code: string): string | null {
  const digits = code.trim().replace(/^0+(?=\d)/, "");
  if (!/^\d{1,4}$/.test(digits)) return null;
  return INSTITUTIONS.find((i) => i.code.replace(/^0+(?=\d)/, "") === digits)?.name ?? null;
}
