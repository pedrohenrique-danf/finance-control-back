import { z } from "zod";
import { type TransactionType, transactionTypes } from "@/shared/enums";

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    type: z.enum(transactionTypes),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use cor hexadecimal (#RRGGBB)."),
    icon: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

/** PUT substitui nome, cor e ícone; o tipo é imutável. */
export const updateCategorySchema = createCategorySchema.omit({ type: true });

export type CreateCategoryInput = z.output<typeof createCategorySchema>;
export type UpdateCategoryInput = z.output<typeof updateCategorySchema>;

export interface CategoryDto {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string | null;
}

/** Categorias criadas para todo usuário novo (as mesmas do protótipo). */
export const DEFAULT_CATEGORIES: ReadonlyArray<Required<CreateCategoryInput>> = [
  { name: "Alimentação", type: "despesa", color: "#A0B179", icon: "utensils" },
  { name: "Moradia", type: "despesa", color: "#636851", icon: "home" },
  { name: "Transporte", type: "despesa", color: "#A3A277", icon: "bus" },
  { name: "Lazer", type: "despesa", color: "#C9A13B", icon: "gamepad" },
  { name: "Saúde", type: "despesa", color: "#B5654A", icon: "heart" },
  { name: "Educação", type: "despesa", color: "#7C8C9A", icon: "graduation" },
  { name: "Assinaturas", type: "despesa", color: "#99A285", icon: "tv" },
  { name: "Salário", type: "receita", color: "#5E7A3A", icon: "briefcase" },
  { name: "Freelance", type: "receita", color: "#8AA05A", icon: "laptop" },
  { name: "Outros", type: "receita", color: "#CACDA5", icon: "sparkles" },
];
