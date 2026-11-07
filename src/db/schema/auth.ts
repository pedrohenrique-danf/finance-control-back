import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers";

/*
 * Tabelas do Better Auth (user, session, account, verification) mapeadas para nomes pt-BR.
 * Reconciliação com o ER (docs 06 e 07):
 * - `usuarios` não tem `senha_hash`: o hash fica em `contas.senha` (provedor "credential").
 * - `contas` substitui `identidades_oauth` (e-mail/senha e Google).
 * - `verificacoes` substitui `tokens_usuario` (verificação de e-mail e redefinição de senha).
 * - `sessoes` é exigida pelo Better Auth (sessão por cookie).
 */

export const users = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("nome", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }).notNull().unique("uq_usuarios_email"),
    emailVerified: boolean("email_verificado").notNull().default(false),
    image: text("imagem"), // exigido por login social; diverge do ER
    active: boolean("ativo").notNull().default(true),
    lastLoginAt: timestamp("ultimo_login_em", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("ck_usuarios_email", sql`${t.email} = lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique("uq_sessoes_token"),
    expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
    ipAddress: text("endereco_ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_sessoes_usuario").on(t.userId)],
);

/** Substitui `identidades_oauth` do ER; guarda também o hash de senha (Better Auth). */
export const accounts = pgTable(
  "contas",
  {
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
  },
  (t) => [
    // equivalente a uq_identidades_oauth_externo do ER
    uniqueIndex("uq_contas_provedor_conta").on(t.providerId, t.accountId),
    // equivalente a uq_identidades_oauth_usuario: uma conta por provedor por usuário
    uniqueIndex("uq_contas_usuario_provedor").on(t.userId, t.providerId),
  ],
);

/** Substitui `tokens_usuario` do ER. */
export const verifications = pgTable(
  "verificacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identificador").notNull(),
    value: text("valor").notNull(),
    expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_verificacoes_identificador").on(t.identifier)],
);
