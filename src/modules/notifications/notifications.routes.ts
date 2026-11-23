import { z } from "zod";
import { json } from "@/app/http/responses";
import { type RouteDefinition, requireUser } from "@/app/http/types";
import { parseBody, parseQuery, parseWith } from "@/app/http/validation";
import { notificationTypes } from "@/shared/enums";
import { idParamsSchema, pageQuerySchema } from "@/shared/schemas";
import type { NotificationsService } from "./notifications.service";

/** Único estado que o usuário altera (docs/07). */
const markReadSchema = z.object({ status: z.literal("lida") }).strict();

const preferenceParamsSchema = z.object({ type: z.enum(notificationTypes) });
const preferenceBodySchema = z.object({ active: z.boolean() }).strict();

export function createNotificationsRoutes(service: NotificationsService): RouteDefinition[] {
  return [
    {
      method: "GET",
      path: "/api/v1/notifications",
      access: "private",
      handler: async (req, ctx) => {
        const { page, pageSize } = parseQuery(req, pageQuerySchema);
        return json(await service.list(requireUser(ctx).id, page, pageSize));
      },
    },
    {
      method: "PUT",
      path: "/api/v1/notifications",
      access: "private",
      handler: async (req, ctx) => {
        await parseBody(req, markReadSchema);
        return json(await service.markAllRead(requireUser(ctx).id, ctx.now));
      },
    },
    {
      method: "PUT",
      path: "/api/v1/notifications/:id",
      access: "private",
      handler: async (req, ctx, params) => {
        const { id } = parseWith(idParamsSchema, params);
        await parseBody(req, markReadSchema);
        return json(await service.markRead(requireUser(ctx).id, id, ctx.now));
      },
    },
    {
      method: "GET",
      path: "/api/v1/notification-preferences",
      access: "private",
      handler: async (_req, ctx) => json({ data: await service.listPreferences(requireUser(ctx).id) }),
    },
    {
      method: "PUT",
      path: "/api/v1/notification-preferences/:type",
      access: "private",
      handler: async (req, ctx, params) => {
        const { type } = parseWith(preferenceParamsSchema, params);
        const { active } = await parseBody(req, preferenceBodySchema);
        return json(await service.setPreference(requireUser(ctx).id, type, active, ctx.now));
      },
    },
  ];
}
