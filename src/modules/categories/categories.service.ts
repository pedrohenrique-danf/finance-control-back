import type { Notifier } from "@/modules/notifications";
import { NotFoundError } from "@/shared/errors";
import type { CategoriesRepository } from "./categories.repository";
import {
  type CategoryDto,
  type CreateCategoryInput,
  DEFAULT_CATEGORIES,
  type UpdateCategoryInput,
} from "./categories.schemas";

const byName = (a: CategoryDto, b: CategoryDto) => a.name.localeCompare(b.name, "pt-BR");

export function createCategoriesService(deps: { repository: CategoriesRepository; notifier: Notifier }) {
  const { repository, notifier } = deps;
  return {
    /** Ordem alfabética pt-BR (a collation do banco pode ser "C", que joga acentos para o fim). */
    async list(userId: string): Promise<CategoryDto[]> {
      return (await repository.listByUser(userId)).sort(byName);
    },

    /** Sem lançar: usado por outros módulos para validar `categoryId` do corpo (400, não 404). */
    find(userId: string, id: string): Promise<CategoryDto | null> {
      return repository.findById(userId, id);
    },

    async get(userId: string, id: string): Promise<CategoryDto> {
      const found = await repository.findById(userId, id);
      if (!found) throw new NotFoundError("Categoria");
      return found;
    },

    async create(userId: string, input: CreateCategoryInput): Promise<CategoryDto> {
      const created = await repository.insert(userId, input);
      await notifier.notify(userId, {
        type: "sistema",
        title: "Categoria criada",
        message: `${created.name} (${created.type})`,
      });
      return created;
    },

    async update(userId: string, id: string, input: UpdateCategoryInput): Promise<CategoryDto> {
      const updated = await repository.update(userId, id, input);
      if (!updated) throw new NotFoundError("Categoria");
      return updated;
    },

    /** RNF02: transações e recorrências ficam "Sem categoria" (ON DELETE SET NULL). */
    async remove(userId: string, id: string): Promise<void> {
      if (!(await repository.delete(userId, id))) throw new NotFoundError("Categoria");
    },

    /** Categorias padrão do usuário novo (idempotente). */
    createDefaults(userId: string): Promise<void> {
      return repository.insertMany(userId, DEFAULT_CATEGORIES);
    },
  };
}

export type CategoriesService = ReturnType<typeof createCategoriesService>;
