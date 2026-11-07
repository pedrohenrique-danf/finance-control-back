export const transactionTypes = ["income", "expense"] as const;
export const transactionNatures = ["fixed", "variable"] as const;
export const transactionOrigins = ["manual", "recurrence", "import"] as const;

export type TransactionType = (typeof transactionTypes)[number];
export type TransactionNature = (typeof transactionNatures)[number];
export type TransactionOrigin = (typeof transactionOrigins)[number];
