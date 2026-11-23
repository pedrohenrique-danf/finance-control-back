import { ValidationError } from "@/shared/errors";
import type { ImportPreview, PdfLine } from "./import.types";
import { parseBankCsv } from "./parsers/bank-csv";
import { parseTransactionsCsv, splitCsvLine } from "./parsers/csv";
import { isOfx, parseOfx } from "./parsers/ofx";
import { PDF_STATEMENT_READERS, PDF_SUPPORTED_LABEL } from "./parsers/pdf-statements";
import { decodeText, fold } from "./parsers/pt-br";

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

function isOfxFile(file: UploadedFile, text: () => string): boolean {
  return /\.(ofx|qfx)$/i.test(file.name) || /ofx/i.test(file.type) || isOfx(text());
}

function isCsv(file: UploadedFile): boolean {
  return /\.(csv|txt)$/i.test(file.name) || file.type === "text/csv";
}

/** CSV no formato do próprio app (separador ";" e colunas data, descricao, valor e tipo, como na exportação)? */
function isAppCsv(text: string): boolean {
  const header = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  if (!header.includes(";")) return false;
  const names = splitCsvLine(header).map((h) => fold(h).toLowerCase());
  return (["data", "descricao", "valor", "tipo"] as const).every((c) => names.includes(c));
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
        const reader = PDF_STATEMENT_READERS.find((r) => r.detect(lines));
        if (reader) {
          return {
            source: reader.source,
            format: "pdf",
            institution: reader.institution,
            kind: reader.kind,
            fileName,
            ...reader.parse(lines),
          };
        }
        throw new ValidationError([
          {
            path: "file",
            message: `PDF não reconhecido. Por enquanto lemos PDFs de: ${PDF_SUPPORTED_LABEL}. Dos outros bancos, envie o extrato em OFX ou CSV.`,
          },
        ]);
      }

      let decoded: string | null = null;
      const text = () => {
        decoded ??= decodeText(file.bytes);
        return decoded;
      };

      if (isOfxFile(file, text)) {
        const { institution, kind, period, rows, errors } = parseOfx(text(), fileName);
        return { source: "ofx", format: "ofx", institution, kind, fileName, period, rows, errors };
      }

      if (isCsv(file)) {
        if (isAppCsv(text())) {
          return {
            source: "csv",
            format: "csv",
            institution: null,
            kind: null,
            fileName,
            period: null,
            ...parseTransactionsCsv(text()),
          };
        }
        const bank = parseBankCsv(text(), fileName);
        if (!bank) {
          throw new ValidationError([
            {
              path: "file",
              message:
                "Não encontramos as colunas do CSV. O arquivo precisa de um cabeçalho com data, descrição e valor (ou débito e crédito).",
            },
          ]);
        }
        const { institution, kind, rows, errors } = bank;
        return { source: "csv_banco", format: "csv", institution, kind, fileName, period: null, rows, errors };
      }

      throw new ValidationError([{ path: "file", message: "Formato não suportado. Envie um CSV, OFX ou PDF." }]);
    },
  };
}

export type ImportPreviewService = ReturnType<typeof createImportPreviewService>;
