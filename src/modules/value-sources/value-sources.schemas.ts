import { z } from "zod";
import { type ValueSourceType, valueSourceTypes } from "@/shared/enums";
import { signedMoneySchema } from "@/shared/schemas";

/** POST e PUT usam o mesmo corpo (PUT substitui o recurso inteiro, inclusive `active`). */
export const valueSourceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80), // único por usuário (uq_fontes_valor_usuario_nome → 409)
    type: z.enum(valueSourceTypes),
    institution: z
      .string()
      .trim()
      .max(80)
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    initialBalance: signedMoneySchema, // pode ser negativo
    active: z.boolean().default(true),
  })
  .strict();

export type ValueSourceInput = z.output<typeof valueSourceInputSchema>;

export interface ValueSourceDto {
  id: string;
  name: string;
  type: ValueSourceType;
  institution: string | null;
  initialBalance: string;
  active: boolean;
  /** Saldo inicial + receitas − despesas efetivadas da conta. */
  currentBalance: string;
}

/** Conta criada para todo usuário novo: o lançamento exige uma conta. */
export const DEFAULT_VALUE_SOURCE: ValueSourceInput = {
  name: "Carteira",
  type: "carteira",
  institution: null,
  initialBalance: "0.00",
  active: true,
};
