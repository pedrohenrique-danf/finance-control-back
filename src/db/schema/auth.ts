import { boolean, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/*
 * Tabelas do Better Auth (user, session, account, verification) mapeadas para nomes pt-BR.
 * RASCUNHO: a reconciliação ER × Better Auth é [PENDENTE DE DEFINIÇÃO] (docs 06 e 07).
 * Nenhuma migração deve ser gerada/aplicada até a aprovação.
 */

const createdAt = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const users = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("nome", { length: 120 }).notNull(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  emailVerified: boolean("email_verificado").notNull().default(false),
  image: text("imagem"), // exigido por login social; diverge do ER
  active: boolean("ativo").notNull().default(true),
  lastLoginAt: timestamp("ultimo_login_em", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
  ipAddress: text("endereco_ip"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Substitui `identidades_oauth` do ER; guarda também o hash de senha (Better Auth). */
export const accounts = pgTable("contas", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("conta_id").notNull(),
  providerId: text("provedor_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expira_em", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expira_em", { withTimezone: true }),
  scope: text("escopo"),
  password: text("senha"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Substitui `tokens_usuario` do ER. */
export const verifications = pgTable("verificacoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identificador").notNull(),
  value: text("valor").notNull(),
  expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
