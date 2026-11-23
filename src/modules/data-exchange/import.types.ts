import type { TransactionNature, TransactionStatus, TransactionType } from "@/shared/enums";

/**
 * Leitor que reconheceu o arquivo importado.
 * - csv: planilha no formato do próprio app (o mesmo da exportação);
 * - csv_banco: CSV exportado por um banco (colunas reconhecidas por nome, ver parsers/bank-csv.ts);
 * - ofx: arquivo OFX/QFX, padrão aceito pela maioria dos bancos;
 * - nubank_fatura / nubank_extrato: PDFs do Nubank.
 */
export const importSources = ["csv", "csv_banco", "ofx", "nubank_fatura", "nubank_extrato"] as const;
export type ImportSource = (typeof importSources)[number];

/** Tipo de documento: extrato de conta ou fatura de cartão (define a conta sugerida na revisão). */
export type StatementKind = "conta" | "cartao";

/** Uma linha lida do arquivo, já normalizada para o contrato (dinheiro em string decimal, data ISO). */
export interface ImportRow {
  /** Linha no arquivo (CSV) ou ordem de leitura (PDF), para referência nos erros e na pré-visualização. */
  line: number;
  date: string;
  description: string;
  /** Sempre positivo; o sinal vem de `type`. */
  amount: string;
  type: TransactionType;
  nature: TransactionNature | null;
  status: TransactionStatus;
  /** Nome da categoria informado no CSV (o vínculo com o id é feito na confirmação). */
  categoryName: string | null;
  /** Nome da conta informado no CSV. */
  accountName: string | null;
  /** "4/6" em compras parceladas da fatura. */
  installment: string | null;
  /** Sugestão de não importar (ex.: pagamento da fatura, que já aparece no extrato da conta). */
  suggestedSkip: boolean;
  note: string | null;
}

/** Erro de uma linha (espelha importacao_erros). */
export interface ImportRowError {
  line: number;
  field: string | null;
  message: string;
  content: string | null;
}

export interface ImportPreview {
  source: ImportSource;
  /** Formato gravado no histórico (importacoes_exportacoes.formato). */
  format: "csv" | "pdf" | "ofx";
  /** Banco identificado no arquivo ("Nubank", "Itaú"...); null quando não deu para saber. */
  institution: string | null;
  /** Extrato de conta ou fatura de cartão; null quando não deu para saber. */
  kind: StatementKind | null;
  fileName: string;
  period: { start: string; end: string } | null;
  rows: ImportRow[];
  errors: ImportRowError[];
}

/** Linha de texto de uma página de PDF, com as células (trechos) na ordem horizontal. */
export interface PdfLine {
  page: number;
  /** Distância do topo da página (cresce para baixo). */
  top: number;
  cells: Array<{ x: number; width: number; text: string }>;
}

/** Resultado de um leitor: as linhas e, quando o arquivo informa, o período. */
export interface ParsedStatement {
  period: { start: string; end: string } | null;
  rows: ImportRow[];
  errors: ImportRowError[];
}
