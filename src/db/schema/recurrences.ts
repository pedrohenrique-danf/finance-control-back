import { sql } from "drizzle-orm";
import { boolean, check, date, index, numeric, pgTable, smallint, uuid, varchar } from "drizzle-orm/pg-core";
import { transactionTypes } from "@/shared/enums";
import { users } from "./auth";
import { categories } from "./categories";
import { createdAt, inList, updatedAt } from "./helpers";
import { valueSources } from "./value-sources";

/** Modelo da despesa fixa; as parcelas futuras são materializadas em `transacoes` (RF04). */
export const recurrences = pgTable(
  "recorrencias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("categoria_id").references(() => categories.id, { onDelete: "set null" }),
    valueSourceId: uuid("fonte_valor_id").references(() => valueSources.id, { onDelete: "set null" }),
    type: varchar("tipo", { length: 10 }).notNull().default("despesa"),
    description: varchar("descricao", { length: 160 }).notNull(),
    amount: numeric("valor", { precision: 14, scale: 2 }).notNull(),
    dueDay: smallint("dia_vencimento").notNull(),
    startDate: date("data_inicio", { mode: "string" }).notNull(),
    endDate: date("data_fim", { mode: "string" }), // NULL = sem término
    active: boolean("ativa").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ck_recorrencias_tipo", sql`${t.type} in (${inList(transactionTypes)})`),
    check("ck_recorrencias_valor", sql`${t.amount} > 0`),
    check("ck_recorrencias_dia", sql`${t.dueDay} between 1 and 31`),
    check("ck_recorrencias_datas", sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
    index("idx_recorrencias_usuario").on(t.userId),
  ],
);
