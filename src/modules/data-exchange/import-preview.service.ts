import { ValidationError } from "@/shared/errors";
import type { ImportPreview, PdfLine } from "./import.types";
import { parseTransactionsCsv } from "./parsers/csv";
import { isNubankAccountStatement, parseNubankAccountStatement } from "./parsers/nubank-account";
import { isNubankCardStatement, parseNubankCardStatement } from "./parsers/nubank-card";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface UploadedFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export interface ImportPreviewDeps {
  /** Extração de texto do PDF (injetada: em teste, linhas prontas; em produção, pdfjs). */
  extractPdfLines: (data: Uint8Array) => Promise<PdfLine[]>;
}

function isPdf(file: UploadedFile): boolean {
  const magic = new TextDecoder("latin1").decode(file.bytes.subarray(0, 5));
  return magic === "%PDF-";
}

function isCsv(file: UploadedFile): boolean {
  return /\.csv$/i.test(file.name) || file.type === "text/csv";
}

/** Lê o arquivo e devolve as linhas para pré-visualização. Não grava nada. */
export function createImportPreviewService(deps: ImportPreviewDeps) {
  return {
    async preview(file: UploadedFile): Promise<ImportPreview> {
      if (file.bytes.byteLength === 0) throw new ValidationError([{ path: "file", message: "Arquivo vazio." }]);
      if (file.bytes.byteLength > MAX_FILE_BYTES) {
        throw new ValidationError([{ path: "file", message: "Arquivo maior que 5 MB." }]);
      }
      const fileName = file.name.slice(0, 255);

      if (isPdf(file)) {
        let lines: PdfLine[];
        try {
          lines = await deps.extractPdfLines(file.bytes);
        } catch {
          throw new ValidationError([
            { path: "file", message: "Não foi possível ler o PDF (arquivo protegido ou corrompido)." },
          ]);
        }
        if (isNubankCardStatement(lines)) {
          return { source: "nubank_fatura", fileName, ...parseNubankCardStatement(lines) };
        }
        if (isNubankAccountStatement(lines)) {
          return { source: "nubank_extrato", fileName, ...parseNubankAccountStatement(lines) };
        }
        throw new ValidationError([
          {
            path: "file",
            message: "PDF não reconhecido. Envie a fatura do cartão ou o extrato da conta do Nubank.",
          },
        ]);
      }

      if (isCsv(file)) {
        const text = new TextDecoder("utf-8").decode(file.bytes);
        return { source: "csv", fileName, period: null, ...parseTransactionsCsv(text) };
      }

      throw new ValidationError([{ path: "file", message: "Formato não suportado. Envie um CSV ou PDF." }]);
    },
  };
}

export type ImportPreviewService = ReturnType<typeof createImportPreviewService>;
