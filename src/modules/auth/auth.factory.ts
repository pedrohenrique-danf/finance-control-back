import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import type { AppConfig } from "@/app/config";
import type { Database } from "@/db/client";
import { accounts, sessions, users, verifications } from "@/db/schema";
import type { Logger } from "@/shared/logger";
import type { Mailer } from "@/shared/mailer";
import { passwordResetEmail } from "./password-reset-email";

/** Validade do link de redefinição de senha. */
const RESET_PASSWORD_TTL_SECONDS = 60 * 60;

export interface AuthDeps {
  db: Database;
  config: AppConfig;
  mailer: Mailer;
  logger: Logger;
  /** Chamado após criar o usuário (cadastro por e-mail ou primeiro login com Google). */
  onUserCreated?: (userId: string) => Promise<void>;
}

export function createAuth(deps: AuthDeps) {
  const { db, config, mailer, logger, onUserCreated } = deps;
  return betterAuth({
    appName: "FinanceControl",
    secret: config.betterAuthSecret,
    baseURL: config.betterAuthUrl,
    trustedOrigins: config.corsOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: RESET_PASSWORD_TTL_SECONDS,
      // Trocar a senha pelo link encerra as sessões abertas (ex.: num aparelho perdido).
      revokeSessionsOnPasswordReset: true,
      // Sem await: o tempo de resposta não pode revelar se o e-mail tem conta. Falha de envio vai para o log.
      sendResetPassword: async ({ user, url }) => {
        const message = passwordResetEmail({
          to: user.email,
          name: user.name,
          url,
          expiresInMinutes: RESET_PASSWORD_TTL_SECONDS / 60,
        });
        void mailer.send(message).catch((error: unknown) => {
          logger.error("password_reset_email_failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
    },
    socialProviders: config.google
      ? { google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret } }
      : {},
    // Limite de tentativas (em memória: vale enquanto houver uma única instância). Desligado em dev/test.
    rateLimit: {
      enabled: config.env === "production",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      ...(onUserCreated ? { user: { create: { after: async (user) => onUserCreated(user.id) } } } : {}),
      // Último login: preenchido a cada sessão criada (e-mail/senha ou Google). Falha não impede o login.
      session: {
        create: {
          after: async (session) => {
            try {
              await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, session.userId));
            } catch (error) {
              logger.error("last_login_update_failed", {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          },
        },
      },
    },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: config.env === "production",
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
