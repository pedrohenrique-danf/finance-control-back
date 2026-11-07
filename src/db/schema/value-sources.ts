import { sql } from "drizzle-orm";
import { boolean, check, numeric, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { valueSourceTypes } from "@/shared/enums";
import { users } from "./auth";
import { createdAt, inList, updatedAt } from "./helpers";

/** Origem/destino do dinheiro: bancos, carteira, cartões (RF03, vínculo opcional). */
export const valueSources = pgTable(
  "fontes_valor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("nome", { length: 80 }).notNull(),
    type: varchar("tipo", { length: 20 }).notNull().default("conta_corrente"),
    institution: varchar("instituicao", { length: 80 }),
    initialBalance: numeric("saldo_inicial", { precision: 14, scale: 2 }).notNull().default("0"),
    active: boolean("ativa").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ck_fontes_valor_tipo", sql`${t.type} in (${inList(valueSourceTypes)})`),
    uniqueIndex("uq_fontes_valor_usuario_nome").on(t.userId, t.name),
  ],
);
