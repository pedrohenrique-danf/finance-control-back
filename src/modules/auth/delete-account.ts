import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";

/**
 * Excluir conta com senha cadastrada exige a senha, mesmo com sessão recente (o Better Auth aceitaria só a sessão).
 * Assim uma sessão roubada não basta para apagar a conta. Contas só do Google seguem pela sessão recente.
 */
export const requirePasswordToDeleteAccount = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/delete-user") return;
  const body = ctx.body as { password?: unknown; token?: unknown } | undefined;
  if (body?.password || body?.token) return;
  const session = await getSessionFromCtx(ctx);
  if (!session) return; // o próprio endpoint responde 401
  const credential = await ctx.context.internalAdapter.findCredentialAccount(session.user.id);
  if (credential?.password) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSWORD_REQUIRED",
      message: "Informe sua senha para excluir a conta.",
    });
  }
});
