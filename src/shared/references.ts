import type { TransactionType } from "./enums";
import type { FieldIssue } from "./errors";

/**
 * Buscas que os módulos recebem por injeção (os serviços de categorias e contas satisfazem esta forma).
 * Tipagem estrutural: `shared/` não importa de `modules/` (docs/04, regras anti-ciclo).
 */
export interface ReferenceLookups {
  categories: { find(userId: string, id: string): Promise<{ type: TransactionType } | null> };
  valueSources: { find(userId: string, id: string): Promise<object | null> };
}

/**
 * Regras de negócio das referências do corpo (docs/07, "Autorização"): a categoria e a conta precisam ser
 * do usuário (outra pessoa → "não encontrada"), e o tipo da categoria precisa bater com o da transação.
 * Referência inexistente no corpo é 400 com `details`, não 404.
 */
export async function referenceIssues(
  lookups: ReferenceLookups,
  userId: string,
  input: { type: TransactionType; categoryId?: string | null | undefined; valueSourceId?: string | null | undefined },
): Promise<FieldIssue[]> {
  const issues: FieldIssue[] = [];
  const [category, valueSource] = await Promise.all([
    input.categoryId ? lookups.categories.find(userId, input.categoryId) : null,
    input.valueSourceId ? lookups.valueSources.find(userId, input.valueSourceId) : null,
  ]);
  if (input.categoryId && !category) issues.push({ path: "categoryId", message: "Categoria não encontrada." });
  if (category && category.type !== input.type) {
    issues.push({ path: "categoryId", message: "Tipo da categoria incompatível." });
  }
  if (input.valueSourceId && !valueSource) issues.push({ path: "valueSourceId", message: "Conta não encontrada." });
  return issues;
}
