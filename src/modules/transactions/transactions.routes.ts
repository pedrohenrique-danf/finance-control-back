import { json, noContent } from "@/app/http/responses";
import { type RouteDefinition, requireUser } from "@/app/http/types";
import { parseBody, parseQuery, parseWith } from "@/app/http/validation";
import { idParamsSchema } from "@/shared/schemas";
import { createTransactionSchema, listTransactionsQuerySchema, updateTransactionSchema } from "./transactions.schemas";
import type { TransactionsService } from "./transactions.service";

export function createTransactionsRoutes(service: TransactionsService): RouteDefinition[] {
  return [
    {
      method: "GET",
      path: "/api/v1/transactions",
      access: "private",
      handler: async (req, ctx) => {
        const query = parseQuery(req, listTransactionsQuerySchema);
        return json(await service.list(requireUser(ctx).id, query, ctx.now));
      },
    },
    {
      method: "GET",
      path: "/api/v1/transactions/:id",
      access: "private",
      handler: async (_req, ctx, params) => {
        const { id } = parseWith(idParamsSchema, params);
        return json(await service.get(requireUser(ctx).id, id));
      },
    },
    {
      method: "POST",
      path: "/api/v1/transactions",
      access: "private",
      handler: async (req, ctx) => {
        const input = await parseBody(req, createTransactionSchema);
        const created = await service.create(requireUser(ctx).id, input, ctx.now);
        return json(created, { status: 201, headers: { Location: `/api/v1/transactions/${created.id}` } });
      },
    },
    {
      method: "PUT",
      path: "/api/v1/transactions/:id",
      access: "private",
      handler: async (req, ctx, params) => {
        const { id } = parseWith(idParamsSchema, params);
        const input = await parseBody(req, updateTransactionSchema);
        return json(await service.update(requireUser(ctx).id, id, input));
      },
    },
    {
      method: "DELETE",
      path: "/api/v1/transactions/:id",
      access: "private",
      handler: async (_req, ctx, params) => {
        const { id } = parseWith(idParamsSchema, params);
        await service.remove(requireUser(ctx).id, id);
        return noContent();
      },
    },
  ];
}
