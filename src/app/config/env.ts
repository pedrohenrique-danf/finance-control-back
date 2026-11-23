import { z } from "zod";
import type { LogLevel } from "@/shared/logger";
import type { MailConfig } from "@/shared/mailer";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.url(),
    DATABASE_URL_DIRECT: z.url().optional(),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET deve ter ao menos 32 caracteres"),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    CORS_ORIGINS: z.string().default(""),
    // E-mail (recuperação de senha). Sem SMTP em dev/test, o link vai para o log.
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "Informe CLIENT_ID e CLIENT_SECRET juntos.",
      });
    }
    const smtp = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS, env.MAIL_FROM];
    if (smtp.some(Boolean) && !smtp.every(Boolean)) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "Informe SMTP_HOST, SMTP_USER, SMTP_PASS e MAIL_FROM juntos.",
      });
    }
    if (env.NODE_ENV === "production" && !env.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP é obrigatório em produção (e-mail de recuperação de senha).",
      });
    }
    if (env.NODE_ENV === "production" && env.CORS_ORIGINS.trim() === "") {
      ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "CORS_ORIGINS é obrigatório em produção." });
    }
  });

export interface AppConfig {
  env: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  databaseUrlDirect: string | undefined;
  betterAuthSecret: string;
  betterAuthUrl: string;
  google: { clientId: string; clientSecret: string } | undefined;
  corsOrigins: string[];
  /** SMTP para e-mails transacionais; ausente em dev/test = e-mails vão para o log. */
  mail: MailConfig | undefined;
  logLevel: LogLevel;
}

/** Lê e valida variáveis de ambiente. Falha cedo, com mensagem clara. */
export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  // variáveis vazias (ex.: GOOGLE_CLIENT_ID= no .env) contam como não informadas
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Configuração inválida:\n${lines.join("\n")}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    databaseUrlDirect: e.DATABASE_URL_DIRECT,
    betterAuthSecret: e.BETTER_AUTH_SECRET,
    betterAuthUrl: e.BETTER_AUTH_URL,
    google:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET }
        : undefined,
    corsOrigins: e.CORS_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    mail:
      e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS && e.MAIL_FROM
        ? {
            host: e.SMTP_HOST,
            port: e.SMTP_PORT,
            secure: e.SMTP_PORT === 465,
            user: e.SMTP_USER,
            pass: e.SMTP_PASS,
            from: e.MAIL_FROM,
          }
        : undefined,
    logLevel: e.LOG_LEVEL,
  };
}
