import { UnauthenticatedError } from "@/shared/errors";
import type { Logger } from "@/shared/logger";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface RequestContext {
  requestId: string;
  user: SessionUser | null;
  logger: Logger;
  now: Date;
}

export type RouteHandler = (req: Request, ctx: RequestContext, params: Record<string, string>) => Promise<Response>;

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RouteDefinition {
  method: HttpMethod;
  path: string; // ex.: "/api/v1/categories/:id"
  access: "public" | "private";
  handler: RouteHandler;
}

export function requireUser(ctx: RequestContext): SessionUser {
  if (!ctx.user) throw new UnauthenticatedError();
  return ctx.user;
}
