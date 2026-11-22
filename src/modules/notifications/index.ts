import type { Database } from "@/db/client";
import type { Logger } from "@/shared/logger";
import { createNotificationsRepository } from "./notifications.repository";
import { createNotificationsRoutes } from "./notifications.routes";
import { createNotificationsService } from "./notifications.service";

export type { NewNotification, NotificationDto } from "./notifications.repository";
export type { NotificationsService, Notifier } from "./notifications.service";

export function createNotificationsModule(deps: { db: Database; logger: Logger }) {
  const repository = createNotificationsRepository(deps.db);
  const service = createNotificationsService({ repository, logger: deps.logger });
  return { service, routes: createNotificationsRoutes(service) };
}
