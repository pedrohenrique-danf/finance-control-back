import type { TransactionNature, TransactionStatus, TransactionType } from "@/shared/enums";

/** Origem reconhecida do arquivo importado. */
export type ImportSource = "csv" | "nubank_fatura" | "nubank_extrato";

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
