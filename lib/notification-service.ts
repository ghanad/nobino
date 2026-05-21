import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

type DbClient = typeof db | Prisma.TransactionClient;

export class NotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationError";
  }
}

export async function getUnreadNotificationCount(
  userId: string,
  client: DbClient = db,
): Promise<number> {
  return client.notification.count({
    where: {
      userId,
      readAt: null,
    },
  });
}

export async function markNotificationAsRead(input: {
  notificationId: string;
  userId: string;
}) {
  const notification = await db.notification.findUnique({
    where: { id: input.notificationId },
    select: {
      id: true,
      userId: true,
      readAt: true,
    },
  });

  if (!notification || notification.userId !== input.userId) {
    throw new NotificationError("Notification was not found.");
  }

  if (notification.readAt) {
    return notification;
  }

  return db.notification.update({
    where: { id: notification.id },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsAsRead(userId: string) {
  return db.notification.updateMany({
    where: {
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
}
