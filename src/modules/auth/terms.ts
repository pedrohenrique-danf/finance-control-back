import { APIError } from "better-auth/api";

/**
 * Versão vigente dos termos de uso e da política de privacidade (data da publicação). Ao mudar o texto, atualize
 * aqui e no frontend (TERMS_VERSION em features/legal) no mesmo PR: o cadastro envia a versão que a pessoa aceitou.
 */
export const TERMS_VERSION = "2026-11-23";

/** Endpoint do cadastro por e-mail no Better Auth (o aceite é obrigatório nele). */
const EMAIL_SIGN_UP_PATH = "/sign-up/email";

/**
 * Dados do aceite gravados na criação do usuário.
 * - Cadastro por e-mail: exige `termsVersion` igual à vigente (o checkbox do formulário), senão 400.
 * - Login social (Google): a tela informa que continuar implica aceitar; grava a versão vigente.
 */
export function termsAcceptance(
  user: Record<string, unknown> & { termsVersion?: unknown },
  path: string | undefined,
  now: Date,
): { termsVersion: string; termsAcceptedAt: Date } {
  if (path === EMAIL_SIGN_UP_PATH && user.termsVersion !== TERMS_VERSION) {
    throw new APIError("BAD_REQUEST", {
      code: "TERMS_NOT_ACCEPTED",
      message: "Aceite os termos de uso e a política de privacidade para criar a conta.",
    });
  }
  return { termsVersion: TERMS_VERSION, termsAcceptedAt: now };
}
