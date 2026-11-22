import { z } from "zod";
import { json } from "@/app/http/responses";
import { type RouteDefinition, requireUser } from "@/app/http/types";
import { parseQuery } from "@/app/http/validation";
import { monthSchema } from "@/shared/schemas";
import type { DashboardService } from "./dashboard.service";

const summaryQuerySchema = z.object({ month: monthSchema }).strict();

export function createDashboardRoutes(service: DashboardService): RouteDefinition[] {
  return [
    {
      method: "GET",
      path: "/api/v1/dashboard/summary",
      access: "private",
      handler: async (req, ctx) => {
        const { month } = parseQuery(req, summaryQuerySchema);
        return json(await service.summary(requireUser(ctx).id, month, ctx.now));
      },
    },
  ];
}
