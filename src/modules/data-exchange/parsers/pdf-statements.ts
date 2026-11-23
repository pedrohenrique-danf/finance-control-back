import type { ImportSource, ParsedStatement, PdfLine, StatementKind } from "../import.types";
import { isNubankAccountStatement, parseNubankAccountStatement } from "./nubank-account";
import { isNubankCardStatement, parseNubankCardStatement } from "./nubank-card";
import { isPicPayAccountStatement, parsePicPayAccountStatement } from "./picpay-account";

/**
 * Leitor de PDF de um banco. Para suportar um banco novo: crie parsers/<banco>-<tipo>.ts com `detect` e
 * `parse` (veja nubank-card.ts), registre aqui e acrescente o `source` em import.types.ts e no front.
 * A ordem importa: o primeiro `detect` que reconhecer o arquivo é usado.
 */
export interface PdfStatementReader {
  source: Exclude<ImportSource, "csv" | "csv_banco" | "ofx">;
  institution: string;
  kind: StatementKind;
  detect: (lines: readonly PdfLine[]) => boolean;
  parse: (lines: readonly PdfLine[]) => ParsedStatement;
}

export const PDF_STATEMENT_READERS: readonly PdfStatementReader[] = [
  {
    source: "nubank_fatura",
    institution: "Nubank",
    kind: "cartao",
    detect: isNubankCardStatement,
    parse: parseNubankCardStatement,
  },
  {
    source: "nubank_extrato",
    institution: "Nubank",
    kind: "conta",
    detect: isNubankAccountStatement,
    parse: parseNubankAccountStatement,
  },
  {
    source: "picpay_extrato",
    institution: "PicPay",
    kind: "conta",
    detect: isPicPayAccountStatement,
    parse: parsePicPayAccountStatement,
  },
];

/** Bancos com PDF suportado, para a mensagem de arquivo não reconhecido. */
export const PDF_SUPPORTED_LABEL = "fatura e extrato do Nubank e extrato do PicPay";
