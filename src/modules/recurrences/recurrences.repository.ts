import { and, asc, eq, gte, isNull, lt, lte, or } from "drizzle-orm";
import type { Database, DbExecutor } from "@/db/client";
import { recurrences, transactions } from "@/db/schema";
import { lastDayOf } from "@/shared/dates";
import type { TransactionStatus, TransactionType } from "@/shared/enums";
import { pendingOccurrences } from "./occurrences";
import type {
  CreateRecurrenceInput,
  RecurrenceDto,
  RepeatedTransactionInput,
  UpdateRecurrenceInput,
} from "./recurrences.schemas";

export type RecurrenceRow = typeof recurrences.$inferSelect;

export const toRecurrenceDto = (r: RecurrenceRow): RecurrenceDto => ({
  id: r.id,
  type: r.type as TransactionType,
  description: r.description,
  amount: r.amount,
  dueDay: r.dueDay,
  startDate: r.startDate,
  endDate: r.endDate,
  active: r.active,
  categoryId: r.categoryId,
  valueSourceId: r.valueSourceId,
});

const byId = (userId: string, id: string) => and(eq(recurrences.id, id), eq(recurrences.userId, userId));

/**
 * Lança as ocorrências pendentes até `toMonth` como transações `pendente` (RF04, docs/06 "materialize") num
 * único INSERT idempotente (uq_transacoes_recorrencia_data) e avança `ultimo_mes_materializado`.
 * Pausada não materializa: ao reativar, o que faltou desde a pausa é lançado.
 */
async function materialize(db: DbExecutor, rec: RecurrenceRow, toMonth: string): Promise<number> {
  if (!rec.active) return 0;
  const { dates, marker } = pendingOccurrences(rec, toMonth);
  if (!marker) return 0;
  let created = 0;
  if (dates.length > 0) {
    const rows = await db
      .insert(transactions)
      .values(
        dates.map((date) => ({
          userId: rec.userId,
          recurrenceId: rec.id,
          categoryId: rec.categoryId,
          valueSourceId: rec.valueSourceId,
          type: rec.type,
          nature: rec.type === "despesa" ? "fixa" : null, // ck_transacoes_natureza
          description: rec.description,
          amount: rec.amount,
          date,
          status: "pendente",
          origin: "recorrencia",
        })),
      )
      .onConflictDoNothing()
      .returning({ id: transactions.id });
    created = rows.length;
  }
  await db.update(recurrences).set({ lastMaterializedMonth: marker }).where(eq(recurrences.id, rec.id));
  return created;
}

export function createRecurrencesRepository(db: Database) {
  return {
    listByUser: (userId: string) => db.select().from(recurrences).where(eq(recurrences.userId, userId)),

    async findById(userId: string, id: string): Promise<RecurrenceRow | null> {
      const [row] = await db.select().from(recurrences).where(byId(userId, id)).limit(1);
      return row ?? null;
    },

    /** Cria e materializa até `toMonth`, atomicamente. */
    createAndMaterialize(userId: string, input: CreateRecurrenceInput, toMonth: string): Promise<RecurrenceRow> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(recurrences)
          .values({
            ...input,
            categoryId: input.categoryId ?? null,
            valueSourceId: input.valueSourceId ?? null,
            userId,
          })
          .returning();
        if (!row) throw new Error("insert não retornou linha");
        await materialize(tx, row, toMonth);
        return row;
      });
    },

    /** Edição vale para as ocorrências ainda não lançadas (docs/07); reativar lança o que faltou. */
    updateAndMaterialize(
      userId: string,
      id: string,
      input: UpdateRecurrenceInput,
      toMonth: string,
    ): Promise<RecurrenceRow | null> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(recurrences)
          .set({ ...input, categoryId: input.categoryId ?? null, valueSourceId: input.valueSourceId ?? null })
          .where(byId(userId, id))
          .returning();
        if (!row) return null;
        await materialize(tx, row, toMonth);
        return row;
      });
    },

    /**
     * "Repetir todo mês" (docs/07): cria a recorrência a partir da transação lançada, grava a transação ligada a
     * ela (ocupando a ocorrência do próprio mês) e materializa os meses seguintes até `toMonth`.
     */
    createFromTransaction(
      userId: string,
      input: RepeatedTransactionInput,
      toMonth: string,
    ): Promise<{ recurrence: RecurrenceRow; transactionId: string }> {
      return db.transaction(async (tx) => {
        const [recurrence] = await tx
          .insert(recurrences)
          .values({
            userId,
            type: input.type,
            description: input.description,
            amount: input.amount,
            dueDay: input.repeatMonthly.dueDay,
            startDate: input.date,
            endDate: input.repeatMonthly.endDate,
            categoryId: input.categoryId,
            valueSourceId: input.valueSourceId,
            lastMaterializedMonth: `${input.date.slice(0, 7)}-01`,
          })
          .returning();
        if (!recurrence) throw new Error("insert não retornou linha");
        const [created] = await tx
          .insert(transactions)
          .values({
            userId,
            recurrenceId: recurrence.id,
            categoryId: input.categoryId,
            valueSourceId: input.valueSourceId,
            type: input.type,
            nature: input.type === "despesa" ? "fixa" : null,
            description: input.description,
            amount: input.amount,
            date: input.date,
            status: input.status,
            origin: "recorrencia",
          })
          .returning({ id: transactions.id });
        if (!created) throw new Error("insert não retornou linha");
        await materialize(tx, recurrence, toMonth);
        return { recurrence, transactionId: created.id };
      });
    },

    /** Recorrências ativas, já iniciadas, com meses a lançar até `month` ("YYYY-MM"). */
    dueForMaterialization: (userId: string, month: string) =>
      db
        .select()
        .from(recurrences)
        .where(
          and(
            eq(recurrences.userId, userId),
            eq(recurrences.active, true),
            lte(recurrences.startDate, lastDayOf(month)),
            or(isNull(recurrences.lastMaterializedMonth), lt(recurrences.lastMaterializedMonth, `${month}-01`)),
          ),
        ),

    materialize: (rec: RecurrenceRow, toMonth: string) => materialize(db, rec, toMonth),

    /** Transações lançadas pela recorrência entre `from` e `to` (agenda). */
    async occurrences(
      userId: string,
      recurrenceId: string,
      from: string,
      to: string,
    ): Promise<Array<{ id: string; date: string; status: TransactionStatus }>> {
      const rows = await db
        .select({ id: transactions.id, date: transactions.date, status: transactions.status })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.recurrenceId, recurrenceId),
            gte(transactions.date, from),
            lte(transactions.date, to),
          ),
        )
        .orderBy(asc(transactions.date));
      return rows.map((r) => ({ ...r, status: r.status as TransactionStatus }));
    },

    async delete(userId: string, id: string): Promise<boolean> {
      const rows = await db.delete(recurrences).where(byId(userId, id)).returning({ id: recurrences.id });
      return rows.length > 0;
    },
  };
}

export type RecurrencesRepository = ReturnType<typeof createRecurrencesRepository>;
