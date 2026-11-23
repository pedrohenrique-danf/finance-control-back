import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { notificationChannels, notificationStatuses, notificationTypes } from "@/shared/enums";
import { users } from "./auth";
import { createdAt, inList, updatedAt } from "./helpers";
import { recurrences } from "./recurrences";
import { transactions } from "./transactions";

/** Avisos gerados pelas ações do usuário (lançar, criar categoria/conta/fixa, importar, exportar), só no app. */
export const notifications = pgTable(
  "notificacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    transactionId: uuid("transacao_id").references(() => transactions.id, { onDelete: "cascade" }),
    recurrenceId: uuid("recorrencia_id").references(() => recurrences.id, { onDelete: "cascade" }),
    type: varchar("tipo", { length: 25 }).notNull(),
    channel: varchar("canal", { length: 10 }).notNull().default("app"),
    title: varchar("titulo", { length: 120 }).notNull(),
    message: text("mensagem").notNull(),
    status: varchar("status", { length: 10 }).notNull().default("pendente"),
    scheduledFor: timestamp("agendada_para", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("enviada_em", { withTimezone: true }),
    readAt: timestamp("lida_em", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("ck_notificacoes_tipo", sql`${t.type} in (${inList(notificationTypes)})`),
    check("ck_notificacoes_canal", sql`${t.channel} in (${inList(notificationChannels)})`),
    check("ck_notificacoes_status", sql`${t.status} in (${inList(notificationStatuses)})`),
    index("idx_notificacoes_usuario_status").on(t.userId, t.status),
    index("idx_notificacoes_fila").on(t.status, t.scheduledFor),
    index("idx_notificacoes_transacao").on(t.transactionId),
    index("idx_notificacoes_recorrencia").on(t.recurrenceId),
  ],
);

/** Quais avisos o usuário quer receber. Sem linha para o tipo = ativo (padrão). */
export const notificationPreferences = pgTable(
  "preferencias_notificacao",
  {
    userId: uuid("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("tipo", { length: 25 }).notNull(),
    channel: varchar("canal", { length: 10 }).notNull().default("app"),
    active: boolean("ativa").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: "pk_preferencias_notificacao", columns: [t.userId, t.type, t.channel] }),
    check("ck_preferencias_notificacao_tipo", sql`${t.type} in (${inList(notificationTypes)})`),
    check("ck_preferencias_notificacao_canal", sql`${t.channel} in (${inList(notificationChannels)})`),
  ],
);
