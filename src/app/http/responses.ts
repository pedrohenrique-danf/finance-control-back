import { AppError } from "@/shared/errors";
import type { Logger } from "@/shared/logger";

export function json<T>(data: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export function toErrorResponse(error: unknown, ctx: { requestId: string; logger: Logger }): Response {
  if (error instanceof AppError) {
    return json(
      { error: { code: error.code, message: error.message, details: error.details, requestId: ctx.requestId } },
      { status: error.status, headers: { "X-Request-Id": ctx.requestId } },
    );
  }
  ctx.logger.error("unhandled_error", {
    requestId: ctx.requestId,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
  });
  return json(
    { error: { code: "INTERNAL_ERROR", message: "Erro interno.", requestId: ctx.requestId } },
    { status: 500, headers: { "X-Request-Id": ctx.requestId } },
  );
}
