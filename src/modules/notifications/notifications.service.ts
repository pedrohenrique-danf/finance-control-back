import { type NotificationType, notificationTypes } from "@/shared/enums";
import { NotFoundError } from "@/shared/errors";
import type { Logger } from "@/shared/logger";
import type { NewNotification, NotificationDto, NotificationsRepository } from "./notifications.repository";

/** O que os outros módulos enxergam: só gerar notificações (docs/07, "Notificações"). */
export interface Notifier {
  notify(userId: string, input: NewNotification): Promise<void>;
}

export interface NotificationPreferenceDto {
  type: NotificationType;
  active: boolean;
}

export function createNotificationsService(deps: { repository: NotificationsRepository; logger: Logger }) {
  const { repository, logger } = deps;
  return {
    /**
     * Melhor esforço: a notificação é consequência da ação, não parte dela. Uma falha aqui vai para o log
     * e não desfaz nem quebra a operação que já foi gravada. Tipo desligado nas preferências: não grava.
     */
    async notify(userId: string, input: NewNotification): Promise<void> {
      try {
        await repository.insert(userId, input, new Date());
      } catch (error) {
        logger.warn("notification_failed", {
          type: input.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async list(userId: string, page: number, pageSize: number) {
      const result = await repository.page(userId, page, pageSize);
      return { data: result.rows, meta: { page, pageSize, total: result.total, unread: result.unread } };
    },

    async markRead(userId: string, id: string, now: Date): Promise<NotificationDto> {
      await repository.markRead(userId, id, now);
      const found = await repository.findById(userId, id);
      if (!found) throw new NotFoundError("Notificação");
      return found;
    },

    async markAllRead(userId: string, now: Date): Promise<{ updated: number }> {
      return { updated: await repository.markAllRead(userId, now) };
    },

    /** Todos os tipos, na ordem do contrato; sem preferência gravada = ativo. */
    async listPreferences(userId: string): Promise<NotificationPreferenceDto[]> {
      const muted = new Set(await repository.mutedTypes(userId));
      return notificationTypes.map((type) => ({ type, active: !muted.has(type) }));
    },

    async setPreference(
      userId: string,
      type: NotificationType,
      active: boolean,
      now: Date,
    ): Promise<NotificationPreferenceDto> {
      await repository.setPreference(userId, type, active, now);
      return { type, active };
    },
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;
