// Fonte única dos valores de domínio. Os valores são os mesmos gravados no banco (CHECK constraints)
// e expostos pela API; o schema Zod deve usar estas listas (z.enum(transactionTypes)).

export const transactionTypes = ["receita", "despesa"] as const;
export const transactionNatures = ["fixa", "variavel"] as const;
export const transactionStatuses = ["pendente", "efetivada"] as const;
export const transactionOrigins = ["manual", "recorrencia", "importacao"] as const;

export const valueSourceTypes = [
  "conta_corrente",
  "poupanca",
  "carteira",
  "cartao_credito",
  "investimento",
  "outro",
] as const;

export const dataOperationTypes = ["importacao", "exportacao"] as const;
export const dataFormats = ["csv", "xlsx"] as const;
export const dataOperationStatuses = ["pendente", "processando", "concluida", "concluida_com_erros", "falhou"] as const;

export const notificationTypes = [
  "lembrete_registro",
  "vencimento_despesa",
  "importacao_concluida",
  "exportacao_pronta",
  "sistema",
] as const;
export const notificationChannels = ["app", "email", "push"] as const;
export const notificationStatuses = ["pendente", "enviada", "lida", "falha"] as const;

export type TransactionType = (typeof transactionTypes)[number];
export type TransactionNature = (typeof transactionNatures)[number];
export type TransactionStatus = (typeof transactionStatuses)[number];
export type TransactionOrigin = (typeof transactionOrigins)[number];
export type ValueSourceType = (typeof valueSourceTypes)[number];
export type DataOperationType = (typeof dataOperationTypes)[number];
export type DataFormat = (typeof dataFormats)[number];
export type DataOperationStatus = (typeof dataOperationStatuses)[number];
export type NotificationType = (typeof notificationTypes)[number];
export type NotificationChannel = (typeof notificationChannels)[number];
export type NotificationStatus = (typeof notificationStatuses)[number];
