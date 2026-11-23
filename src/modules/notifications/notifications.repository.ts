import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { notificationPreferences, notifications } from "@/db/schema";
import type { NotificationStatus, NotificationType } from "@/shared/enums";

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  createdAt: string;
  readAt: string | null;
  transactionId: string | null;
  recurrenceId: string | null;
}

export interface NewNotification {
  type: NotificationType;
  title: string;
  message: string;
  transactionId?: string | null;
  recurrenceId?: string | null;
}

type Row = typeof notifications.$inferSelect;

const toDto = (r: Row): NotificationDto => ({
  id: r.id,
  type: r.type as NotificationType,
  title: r.title,
  message: r.message,
  status: r.status as NotificationStatus,
  createdAt: r.createdAt.toISOString(),
  readAt: r.readAt?.toISOString() ?? null,
  transactionId: r.transactionId,
  recurrenceId: r.recurrenceId,
});

/** Só o canal app aparece na tela de notificações. */
const ofUser = (userId: string) => and(eq(notifications.userId, userId), eq(notifications.channel, "app"));

const column = (c: { name: string }) => sql.identifier(c.name);

export function createNotificationsRepository(db: Database) {
  return {
    /**
     * Grava o aviso, a menos que o usuário tenha desligado esse tipo (uma ida ao banco só).
     * Canal app: entregue ao gravar (`enviada`); o usuário marca como lida.
     */
    async insert(userId: string, input: NewNotification, now: Date): Promise<boolean> {
      const n = notifications;
      const p = notificationPreferences;
      const at = now.toISOString();
      const result = await db.execute(sql`
        insert into ${n} (${column(n.userId)}, ${column(n.type)}, ${column(n.channel)}, ${column(n.title)},
          ${column(n.message)}, ${column(n.status)}, ${column(n.scheduledFor)}, ${column(n.sentAt)},
          ${column(n.transactionId)}, ${column(n.recurrenceId)})
        select ${userId}, ${input.type}, 'app', ${input.title.slice(0, 120)}, ${input.message}, 'enviada',
          ${at}::timestamptz, ${at}::timestamptz, ${input.transactionId ?? null}::uuid, ${input.recurrenceId ?? null}::uuid
        where not exists (
          select 1 from ${p}
          where ${p.userId} = ${userId} and ${p.type} = ${input.type} and ${p.channel} = 'app' and ${p.active} = false
        )`);
      return (result.rowCount ?? 0) > 0;
    },

    /** Tipos desligados pelo usuário (os demais estão ativos). */
    async mutedTypes(userId: string): Promise<NotificationType[]> {
      const rows = await db
        .select({ type: notificationPreferences.type })
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.userId, userId),
            eq(notificationPreferences.channel, "app"),
            eq(notificationPreferences.active, false),
          ),
        );
      return rows.map((r) => r.type as NotificationType);
    },

    async setPreference(userId: string, type: NotificationType, active: boolean, now: Date): Promise<void> {
      await db
        .insert(notificationPreferences)
        .values({ userId, type, channel: "app", active, updatedAt: now })
        .onConflictDoUpdate({
          target: [notificationPreferences.userId, notificationPreferences.type, notificationPreferences.channel],
          set: { active, updatedAt: now },
        });
    },

    async page(userId: string, page: number, pageSize: number) {
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(notifications)
          .where(ofUser(userId))
          .orderBy(desc(notifications.createdAt), desc(notifications.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db
          .select({
            total: count(),
            unread: sql<number>`count(*) filter (where ${notifications.status} <> 'lida')`.mapWith(Number),
          })
          .from(notifications)
          .where(ofUser(userId)),
      ]);
      return { rows: rows.map(toDto), total: totals[0]?.total ?? 0, unread: totals[0]?.unread ?? 0 };
    },

    async findById(userId: string, id: string): Promise<NotificationDto | null> {
      const [row] = await db
        .select()
        .from(notifications)
        .where(and(ofUser(userId), eq(notifications.id, id)))
        .limit(1);
      return row ? toDto(row) : null;
    },

    /** Marca como lida; a já lida mantém a data original (PUT idempotente). */
    async markRead(userId: string, id: string, now: Date): Promise<void> {
      await db
        .update(notifications)
        .set({ status: "lida", readAt: now })
        .where(and(ofUser(userId), eq(notifications.id, id), ne(notifications.status, "lida")));
    },

    async markAllRead(userId: string, now: Date): Promise<number> {
      const rows = await db
        .update(notifications)
        .set({ status: "lida", readAt: now })
        .where(and(ofUser(userId), ne(notifications.status, "lida")))
        .returning({ id: notifications.id });
      return rows.length;
    },
  };
}

export type NotificationsRepository = ReturnType<typeof createNotificationsRepository>;
