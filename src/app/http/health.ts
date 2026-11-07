import { json } from "./responses";
import type { RouteDefinition } from "./types";

export const healthRoute: RouteDefinition = {
  method: "GET",
  path: "/api/v1/health",
  access: "public",
  handler: async () => json({ status: "ok" }),
};
