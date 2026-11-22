import type { ImportRow, ImportRowError } from "../import.types";
import { fold, parseBrlAmount, parseCsvDate } from "./pt-br";

// Formato CSV de transações (RF07), padrão Excel pt-BR — o mesmo da exportação:
//   data;descricao;valor;tipo;natureza;situacao;categoria;conta
//   05/11/2026;Salário estágio;4.200,00;receita;;efetivada;Salário;Nubank
// Separador ";", data dd/mm/aaaa (aceita AAAA-MM-DD), valor "1.234,56" positivo, UTF-8 (com ou sem BOM).

export const CSV_COLUMNS = [
  "data",
  "descricao",
  "valor",
  "tipo",
  "natureza",
  "situacao",
  "categoria",
  "conta",
] as const;
type Column = (typeof CSV_COLUMNS)[number];
const REQUIRED: readonly Column[] = ["data", "descricao", "valor", "tipo"];

export const MAX_ROWS = 2000;

/** Divide uma linha CSV com separador ";" respeitando aspas ("a;b" e "" escapado). */
export function splitCsvLine(line: string, separator = ";"): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function statusOf(raw: string): ImportRow["status"] | null {
  const value = fold(raw);
  if (value === "" || value === "EFETIVADA" || value === "PAGO" || value === "RECEBIDO") return "efetivada";
  if (value === "PENDENTE") return "pendente";
  return null;
}

export function parseTransactionsCsv(text: string): { rows: ImportRow[]; errors: ImportRowError[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerLine = lines[0] ?? "";
  const errors: ImportRowError[] = [];
  const rows: ImportRow[] = [];

  if (!headerLine.includes(";")) {
    return {
      rows,
      errors: [{ line: 1, field: null, message: "Use ponto e vírgula (;) como separador.", content: headerLine }],
    };
  }
  const header = splitCsvLine(headerLine).map((h) => fold(h).toLowerCase());
  const index = new Map<Column, number>();
  for (const column of CSV_COLUMNS) {
    const position = header.indexOf(column);
    if (position >= 0) index.set(column, position);
  }
  const missing = REQUIRED.filter((c) => !index.has(c));
  if (missing.length) {
    return {
      rows,
      errors: [
        { line: 1, field: null, message: `Cabeçalho sem as colunas: ${missing.join(", ")}.`, content: headerLine },
      ],
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (raw.trim() === "") continue;
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
    const cells = splitCsvLine(raw);
    const get = (column: Column) => {
      const position = index.get(column);
      return position === undefined ? "" : (cells[position] ?? "");
    };
    const fail = (field: Column, message: string) => errors.push({ line: lineNumber, field, message, content: raw });

    const date = parseCsvDate(get("data"));
    const description = get("descricao").slice(0, 160);
    const money = parseBrlAmount(get("valor"));
    const type = fold(get("tipo")).toLowerCase();
    const natureRaw = fold(get("natureza")).toLowerCase();
    const status = statusOf(get("situacao"));

    if (!date) fail("data", "Data inválida (use dd/mm/aaaa).");
    if (!description) fail("descricao", "Descrição vazia.");
    if (!money || money.negative || Number(money.amount) <= 0)
      fail("valor", "Valor inválido (use 1.234,56, positivo).");
    if (type !== "receita" && type !== "despesa") fail("tipo", 'Tipo deve ser "receita" ou "despesa".');
    if (natureRaw !== "" && natureRaw !== "fixa" && natureRaw !== "variavel") {
      fail("natureza", 'Natureza deve ser "fixa", "variavel" ou vazia.');
    }
    if (!status) fail("situacao", 'Situação deve ser "efetivada" ou "pendente".');
    if (!date || !description || !money || money.negative || Number(money.amount) <= 0) continue;
    if ((type !== "receita" && type !== "despesa") || !status) continue;
    if (natureRaw !== "" && natureRaw !== "fixa" && natureRaw !== "variavel") continue;

    rows.push({
      line: lineNumber,
      date,
      description,
      amount: money.amount,
      type,
      // ck_transacoes_natureza: receita sem natureza; despesa sem natureza vira variável.
      nature: type === "receita" ? null : natureRaw === "fixa" ? "fixa" : "variavel",
      status,
      categoryName: get("categoria") || null,
      accountName: get("conta") || null,
      installment: null,
      suggestedSkip: false,
      note: null,
    });
  }
  return { rows, errors };
}

/** Uma linha CSV no formato de exportação (aspas quando necessário). */
export function toCsvLine(values: readonly string[]): string {
  return values.map((v) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(";");
}
