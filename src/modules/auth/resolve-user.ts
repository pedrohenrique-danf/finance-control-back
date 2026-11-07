import type { RequestContext } from "@/app/http/types";
import type { Auth } from "./auth.factory";

/** Resolve o usuário da sessão (cookie do Better Auth) para o contexto da requisição. */
export async function resolveUser(auth: Pick<Auth, "api">, req: Request): Promise<RequestContext["user"]> {
  const session = await auth.api.getSession({ headers: req.headers });
  return session ? { id: session.user.id, email: session.user.email, name: session.user.name } : null;
}
