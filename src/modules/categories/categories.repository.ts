import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { categories } from "@/db/schema";
import { isUniqueViolation } from "@/shared/db-errors";
import type { TransactionType } from "@/shared/enums";
import { ConflictError } from "@/shared/errors";
import type { CategoryDto, CreateCategoryInput, UpdateCategoryInput } from "./categories.schemas";

type Row = Pick<typeof categories.$inferSelect, "id" | "name" | "type" | "color" | "icon">;

const toDto = (r: Row): CategoryDto => ({
  id: r.id,
  name: r.name,
  type: r.type as TransactionType,
  color: r.color,
  icon: r.icon,
});

const columns = {
  id: categories.id,
  name: categories.name,
  type: categories.type,
  color: categories.color,
  icon: categories.icon,
};

function rethrowConflict(error: unknown): never {
  // uq_categorias_usuario_tipo_nome
  if (isUniqueViolation(error)) throw new ConflictError("Já existe uma categoria com este nome.", "name");
  throw error;
}

export function createCategoriesRepository(db: Database) {
  return {
    async listByUser(userId: string): Promise<CategoryDto[]> {
      const rows = await db.select(columns).from(categories).where(eq(categories.userId, userId));
      return rows.map((r) => toDto(r));
    },

    async findById(userId: string, id: string): Promise<CategoryDto | null> {
      const [row] = await db
        .select(columns)
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.userId, userId)))
        .limit(1);
      return row ? toDto(row) : null;
    },

    async insert(userId: string, data: CreateCategoryInput): Promise<CategoryDto> {
      try {
        const [row] = await db
          .insert(categories)
          .values({ ...data, icon: data.icon ?? null, userId })
          .returning(columns);
        if (!row) throw new Error("insert não retornou linha");
        return toDto(row);
      } catch (error) {
        rethrowConflict(error);
      }
    },

    /** Idempotente (cadastro e seed): ignora nomes que já existem. */
    async insertMany(userId: string, data: ReadonlyArray<CreateCategoryInput>): Promise<void> {
      if (data.length === 0) return;
      await db
        .insert(categories)
        .values(data.map((d) => ({ ...d, icon: d.icon ?? null, userId })))
        .onConflictDoNothing();
    },

    async update(userId: string, id: string, data: UpdateCategoryInput): Promise<CategoryDto | null> {
      try {
        const [row] = await db
          .update(categories)
          .set({ ...data, icon: data.icon ?? null })
          .where(and(eq(categories.id, id), eq(categories.userId, userId)))
          .returning(columns);
        return row ? toDto(row) : null;
      } catch (error) {
        rethrowConflict(error);
      }
    },

    async delete(userId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(categories)
        .where(and(eq(categories.id, id), eq(categories.userId, userId)))
        .returning({ id: categories.id });
      return rows.length > 0;
    },
  };
}

export type CategoriesRepository = ReturnType<typeof createCategoriesRepository>;
