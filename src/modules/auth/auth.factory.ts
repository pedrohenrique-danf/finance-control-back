import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { AppConfig } from "@/app/config";
import type { Database } from "@/db/client";
import { accounts, sessions, users, verifications } from "@/db/schema";

export interface AuthDeps {
  db: Database;
  config: AppConfig;
  /** Chamado após criar o usuário (cadastro por e-mail ou primeiro login com Google). */
  onUserCreated?: (userId: string) => Promise<void>;
}

export function createAuth(deps: AuthDeps) {
  const { db, config, onUserCreated } = deps;
  return betterAuth({
    appName: "FinanceControl",
    secret: config.betterAuthSecret,
    baseURL: config.betterAuthUrl,
    trustedOrigins: config.corsOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    socialProviders: config.google
      ? { google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret } }
      : {},
    databaseHooks: onUserCreated ? { user: { create: { after: async (user) => onUserCreated(user.id) } } } : {},
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: config.env === "production",
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
