import { json, noContent } from "@/app/http/responses";
import { type RouteDefinition, requireUser } from "@/app/http/types";
import { parseBody, parseWith } from "@/app/http/validation";
import { idParamsSchema } from "@/shared/schemas";
import { createRecurrenceSchema, updateRecurrenceSchema } from "./recurrences.schemas";
import type { RecurrencesService } from "./recurrences.service";

export function createRecurrencesRoutes(service: RecurrencesService): RouteDefinition[] {
  return [
    {
      method: "GET",
      path: "/api/v1/recurrences",
      access: "private",
      handler: async (_req, ctx) => json({ data: await service.list(requireUser(ctx).id) }),
    },
    {
      method: "GET",
      path: "/api/v1/recurrences/:id",
      access: "private",
      handler: async (_req, ctx, params) => {
        const { id } = parseWith(idParamsSchema, params);
        return json(await service.get(requireUser(ctx).id, id, ctx.now));
      },
    },
    {
      method: "POST",
      path: "/api/v1/recurrences",
      access: "private",
      handler: async (req, ctx) => {
        const input = await parseBody(req, createRecurrenceSchema);
        const created = await service.create(requireUser(ctx).id, input, ctx.now);
        return json(created, { status: 201, headers: { Location: `/api/v1/recurrences/${created.id}` } });
      },
    },
    {
      method: "PUT",
      path: "/api/v1/recurrences/:id",
      access: "private",
      handler: async (req, ctx, params) => {
        const { id } = parseWith(idParamsSchema, params);
        const input = await parseBody(req, updateRecurrenceSchema);
        return json(await service.update(requireUser(ctx).id, id, input, ctx.now));
      },
    },
    {
      method: "DELETE",
      path: "/api/v1/recurrences/:id",
      access: "private",
      handler: async (_req, ctx, params) => {
        const { id } = parseWith(idParamsSchema, params);
        await service.remove(requireUser(ctx).id, id);
        return noContent();
      },
    },
  ];
}
