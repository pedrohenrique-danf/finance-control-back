import { sql } from "drizzle-orm";
import { char, check, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { transactionTypes } from "@/shared/enums";
import { users } from "./auth";
import { createdAt, inList, updatedAt } from "./helpers";

/** Categorias personalizadas de receitas e despesas (RF02). */
export const categories = pgTable(
  "categorias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("nome", { length: 60 }).notNull(),
    type: varchar("tipo", { length: 10 }).notNull(),
    color: char("cor", { length: 7 }).notNull().default("#6B7280"),
    icon: varchar("icone", { length: 40 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ck_categorias_tipo", sql`${t.type} in (${inList(transactionTypes)})`),
    check("ck_categorias_cor", sql`${t.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    uniqueIndex("uq_categorias_usuario_tipo_nome").on(t.userId, t.type, t.name),
  ],
);
