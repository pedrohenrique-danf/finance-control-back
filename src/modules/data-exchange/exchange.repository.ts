import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import { categories, dataOperations, importErrors, transactions, valueSources } from "@/db/schema";
import { lastDayOf, monthRange } from "@/shared/dates";
import type { DataFormat, DataOperationStatus, DataOperationType } from "@/shared/enums";
import type { ConfirmImportInput, DataOperationDto } from "./exchange.schemas";

type OperationRow = typeof dataOperations.$inferSelect;

const toDto = (r: OperationRow): DataOperationDto => ({
  id: r.id,
  type: r.type as DataOperationType,
  format: r.format as DataFormat,
  status: r.status as DataOperationStatus,
  fileName: r.fileName,
  periodStart: r.periodStart,
  periodEnd: r.periodEnd,
  totalRows: r.totalRows,
  successRows: r.successRows,
  errorRows: r.errorRows,
  errorMessage: r.errorMessage,
  createdAt: r.createdAt.toISOString(),
  completedAt: r.completedAt?.toISOString() ?? null,
});

/** Lotes por INSERT (limite de parâmetros do PostgreSQL). */
const CHUNK = 500;
function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

export function createExchangeRepository(db: Database) {
  return {
    /** Operação + transações (origem importacao) + erros, atomicamente. */
    saveImport(userId: string, input: ConfirmImportInput, now: Date): Promise<DataOperationDto> {
      const dates = input.rows.map((r) => r.date).sort();
      return db.transaction(async (tx) => {
        const [operation] = await tx
          .insert(dataOperations)
          .values({
            userId,
            type: "importacao",
            format: input.format,
            status: input.errors.length ? "concluida_com_erros" : "concluida",
            fileName: input.fileName,
            periodStart: dates[0] ?? null,
            periodEnd: dates.at(-1) ?? null,
            totalRows: input.rows.length + input.errors.length,
            successRows: input.rows.length,
            errorRows: input.errors.length,
            completedAt: now,
          })
          .returning();
        if (!operation) throw new Error("insert não retornou linha");
        for (const part of chunks(input.rows)) {
          await tx
            .insert(transactions)
            .values(part.map((row) => ({ ...row, userId, origin: "importacao", dataOperationId: operation.id })));
        }
        for (const part of chunks(input.errors)) {
          await tx.insert(importErrors).values(
            part.map((e) => ({
              operationId: operation.id,
              lineNumber: e.line,
              field: e.field?.slice(0, 60) ?? null,
              message: e.message,
              lineContent: e.content,
            })),
          );
        }
        return toDto(operation);
      });
    },

    async saveExport(userId: string, input: { fileName: string; month: string; rows: number }, now: Date) {
      await db.insert(dataOperations).values({
        userId,
        type: "exportacao",
        format: "csv",
        status: "concluida",
        fileName: input.fileName,
        periodStart: `${input.month}-01`,
        periodEnd: lastDayOf(input.month),
        totalRows: input.rows,
        successRows: input.rows,
        errorRows: 0,
        completedAt: now,
      });
    },

    /** Histórico, mais recente primeiro. */
    async history(userId: string): Promise<DataOperationDto[]> {
      const rows = await db
        .select()
        .from(dataOperations)
        .where(eq(dataOperations.userId, userId))
        .orderBy(desc(dataOperations.createdAt), desc(dataOperations.id))
        .limit(100);
      return rows.map(toDto);
    },

    /** Transações do mês com os nomes de categoria e conta (exportação). */
    exportRows(userId: string, month: string) {
      const range = monthRange(month);
      return db
        .select({
          date: transactions.date,
          description: transactions.description,
          amount: transactions.amount,
          type: transactions.type,
          nature: transactions.nature,
          status: transactions.status,
          category: categories.name,
          account: valueSources.name,
        })
        .from(transactions)
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .leftJoin(valueSources, eq(valueSources.id, transactions.valueSourceId))
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.date, range.start),
            lt(transactions.date, range.endExclusive),
          ),
        )
        .orderBy(asc(transactions.date), asc(transactions.createdAt), asc(transactions.id));
    },
  };
}

export type ExchangeRepository = ReturnType<typeof createExchangeRepository>;
