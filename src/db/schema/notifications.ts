import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { notificationChannels, notificationStatuses, notificationTypes } from "@/shared/enums";
import { users } from "./auth";
import { createdAt, inList, updatedAt } from "./helpers";
import { recurrences } from "./recurrences";
import { transactions } from "./transactions";

/** Fila e histórico de avisos (lembretes de registro, vencimentos etc.). Pós-MVP: só estrutura. */
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

/** Quais avisos o usuário deseja receber, por qual canal e em que horário. */
export const notificationPreferences = pgTable(
  "preferencias_notificacao",
  {
    userId: uuid("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("tipo", { length: 25 }).notNull(),
    channel: varchar("canal", { length: 10 }).notNull(),
    active: boolean("ativa").notNull().default(true),
    preferredTime: time("horario_preferido").notNull().default("20:00"),
    daysInAdvance: smallint("antecedencia_dias").notNull().default(1),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: "pk_preferencias_notificacao", columns: [t.userId, t.type, t.channel] }),
    check("ck_preferencias_notificacao_tipo", sql`${t.type} in (${inList(notificationTypes)})`),
    check("ck_preferencias_notificacao_canal", sql`${t.channel} in (${inList(notificationChannels)})`),
    check("ck_preferencias_notificacao_antecedencia", sql`${t.daysInAdvance} between 0 and 30`),
  ],
);
