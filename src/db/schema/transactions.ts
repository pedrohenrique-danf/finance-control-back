import { sql } from "drizzle-orm";
import { check, date, index, numeric, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { transactionNatures, transactionOrigins, transactionStatuses, transactionTypes } from "@/shared/enums";
import { users } from "./auth";
import { categories } from "./categories";
import { dataOperations } from "./data-exchange";
import { createdAt, inList, updatedAt } from "./helpers";
import { recurrences } from "./recurrences";
import { valueSources } from "./value-sources";

/**
 * Receitas e despesas (RF03, RF05, RF06).
 * RNF02: excluir categoria, fonte, recorrência ou operação NÃO apaga a transação (ON DELETE SET NULL).
 */
export const transactions = pgTable(
  "transacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("categoria_id").references(() => categories.id, { onDelete: "set null" }),
    valueSourceId: uuid("fonte_valor_id").references(() => valueSources.id, { onDelete: "set null" }),
    recurrenceId: uuid("recorrencia_id").references(() => recurrences.id, { onDelete: "set null" }),
    dataOperationId: uuid("operacao_dados_id").references(() => dataOperations.id, { onDelete: "set null" }),
    type: varchar("tipo", { length: 10 }).notNull(),
    nature: varchar("natureza", { length: 10 }), // somente despesas
    description: varchar("descricao", { length: 160 }).notNull(),
    amount: numeric("valor", { precision: 14, scale: 2 }).notNull(), // sempre positivo; o sinal vem de tipo
    date: date("data_transacao", { mode: "string" }).notNull(),
    status: varchar("status", { length: 10 }).notNull().default("efetivada"),
    origin: varchar("origem", { length: 12 }).notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ck_transacoes_tipo", sql`${t.type} in (${inList(transactionTypes)})`),
    check(
      "ck_transacoes_natureza",
      sql`(${t.type} = 'receita' and ${t.nature} is null) or (${t.type} = 'despesa' and ${t.nature} in (${inList(transactionNatures)}))`,
    ),
    check("ck_transacoes_valor", sql`${t.amount} > 0`),
    check("ck_transacoes_data", sql`${t.date} >= date '2000-01-01'`),
    check("ck_transacoes_status", sql`${t.status} in (${inList(transactionStatuses)})`),
    check("ck_transacoes_origem", sql`${t.origin} in (${inList(transactionOrigins)})`),
    // idempotência da projeção de recorrências (RF04)
    uniqueIndex("uq_transacoes_recorrencia_data").on(t.recurrenceId, t.date),
    index("idx_transacoes_usuario_data").on(t.userId, t.date),
    // FKs com ON DELETE SET NULL: evitam varredura completa ao excluir categoria/fonte/operação
    index("idx_transacoes_categoria").on(t.categoryId),
    index("idx_transacoes_fonte_valor").on(t.valueSourceId),
    index("idx_transacoes_operacao_dados").on(t.dataOperationId),
  ],
);
