import { json, noContent } from "@/app/http/responses";
import { type RouteDefinition, requireUser } from "@/app/http/types";
import { parseBody, parseWith } from "@/app/http/validation";
import { idParamsSchema } from "@/shared/schemas";
import { createCategorySchema, updateCategorySchema } from "./categories.schemas";
import type { CategoriesService } from "./categories.service";

export function createCategoriesRoutes(service: CategoriesService): RouteDefinition[] {
  return [
    {
      method: "GET",
      path: "/api/v1/categories",
      access: "private",
      handler: async (_req, ctx) => json({ data: await service.list(requireUser(ctx).id) }),
    },
    {
      method: "GET",
      path: "/api/v1/categories/:id",
      access: "private",
      handler: async (_req, ctx, params) => {
        const { id } = parseWith(idParamsSchema, params);
        return json(await service.get(requireUser(ctx).id, id));
      },
    },
    {
      method: "POST",
      path: "/api/v1/categories",
      access: "private",
      handler: async (req, ctx) => {
        const input = await parseBody(req, createCategorySchema);
        const created = await service.create(requireUser(ctx).id, input);
        return json(created, { status: 201, headers: { Location: `/api/v1/categories/${created.id}` } });
      },
    },
    {
      method: "PUT",
      path: "/api/v1/categories/:id",
      access: "private",
      handler: async (req, ctx, params) => {
        const { id } = parseWith(idParamsSchema, params);
        const input = await parseBody(req, updateCategorySchema);
        return json(await service.update(requireUser(ctx).id, id, input));
      },
    },
    {
      method: "DELETE",
      path: "/api/v1/categories/:id",
      access: "private",
      handler: async (_req, ctx, params) => {
        const { id } = parseWith(idParamsSchema, params);
        await service.remove(requireUser(ctx).id, id);
        return noContent();
      },
    },
  ];
}
