import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { transactions, valueSources } from "@/db/schema";
import { isUniqueViolation } from "@/shared/db-errors";
import type { ValueSourceType } from "@/shared/enums";
import { ConflictError } from "@/shared/errors";
import type { ValueSourceDto, ValueSourceInput } from "./value-sources.schemas";

function rethrowConflict(error: unknown): never {
  // uq_fontes_valor_usuario_nome
  if (isUniqueViolation(error)) throw new ConflictError("Já existe uma conta com este nome.", "name");
  throw error;
}

/** Saldo atual somado no SQL (numeric), nunca em float. */
const currentBalance = sql<string>`(${valueSources.initialBalance} + coalesce(sum(
  case when ${transactions.type} = 'receita' then ${transactions.amount} else -${transactions.amount} end
), 0))::numeric(16, 2)::text`;

export function createValueSourcesRepository(db: Database) {
  async function select(where: SQL | undefined): Promise<ValueSourceDto[]> {
    const rows = await db
      .select({
        id: valueSources.id,
        name: valueSources.name,
        type: valueSources.type,
        institution: valueSources.institution,
        initialBalance: valueSources.initialBalance,
        active: valueSources.active,
        currentBalance,
      })
      .from(valueSources)
      .leftJoin(
        transactions,
        and(
          eq(transactions.valueSourceId, valueSources.id),
          eq(transactions.userId, valueSources.userId),
          eq(transactions.status, "efetivada"),
        ),
      )
      .where(where)
      .groupBy(valueSources.id)
      .orderBy(asc(valueSources.createdAt), asc(valueSources.name));
    return rows.map((r) => ({ ...r, type: r.type as ValueSourceType }));
  }

  return {
    listByUser: (userId: string) => select(eq(valueSources.userId, userId)),

    async findById(userId: string, id: string): Promise<ValueSourceDto | null> {
      const [row] = await select(and(eq(valueSources.userId, userId), eq(valueSources.id, id)));
      return row ?? null;
    },

    async insert(userId: string, data: ValueSourceInput): Promise<string> {
      try {
        const [row] = await db
          .insert(valueSources)
          .values({ ...data, userId })
          .returning({ id: valueSources.id });
        if (!row) throw new Error("insert não retornou linha");
        return row.id;
      } catch (error) {
        rethrowConflict(error);
      }
    },

    /** Idempotente (cadastro e seed): ignora nomes que já existem. */
    async insertIfMissing(userId: string, data: ValueSourceInput): Promise<void> {
      await db
        .insert(valueSources)
        .values({ ...data, userId })
        .onConflictDoNothing();
    },

    async update(userId: string, id: string, data: ValueSourceInput): Promise<boolean> {
      try {
        const rows = await db
          .update(valueSources)
          .set(data)
          .where(and(eq(valueSources.id, id), eq(valueSources.userId, userId)))
          .returning({ id: valueSources.id });
        return rows.length > 0;
      } catch (error) {
        rethrowConflict(error);
      }
    },
  };
}

export type ValueSourcesRepository = ReturnType<typeof createValueSourcesRepository>;
