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

type NotificationTextInput = {
  type: string;
  title: string;
  body: string;
};

const NOTIFICATION_TITLE_LABELS: Record<string, string> = {
  ALTERNATIVE_ACCEPTED: "زمان پیشنهادی پذیرفته شد",
  ALTERNATIVE_PROPOSED: "زمان جایگزین پیشنهاد شد",
  ALTERNATIVE_REJECTED: "زمان پیشنهادی رد شد",
  NEW_PENDING_RESERVATION: "درخواست رزرو جدید",
  RESERVATION_APPROVED: "رزرو تایید شد",
  RESERVATION_CANCELLED: "رزرو لغو شد",
  RESERVATION_REJECTED: "رزرو رد شد",
};

const NOTIFICATION_BODY_LABELS: Record<string, string> = {
  "A manager cancelled your approved reservation.":
    "مدیر رزرو تاییدشده شما را لغو کرد.",
  "A manager proposed an alternative time for your reservation.":
    "مدیر یک زمان جایگزین برای رزرو شما پیشنهاد کرده است.",
  "A requester accepted your proposed alternative time.":
    "درخواست کننده زمان جایگزین پیشنهادی شما را پذیرفت.",
  "A requester cancelled a pending reservation.":
    "درخواست کننده یک رزرو در انتظار تایید را لغو کرد.",
  "A requester rejected your proposed alternative time.":
    "درخواست کننده زمان جایگزین پیشنهادی شما را رد کرد.",
  "A reservation request is waiting for manager review.":
    "یک درخواست رزرو در انتظار بررسی مدیر است.",
  "Your reservation request has been approved.":
    "درخواست رزرو شما تایید شد.",
  "Your reservation request has been rejected.":
    "درخواست رزرو شما رد شد.",
};

export function getNotificationDisplayText(notification: NotificationTextInput) {
  return {
    title: NOTIFICATION_TITLE_LABELS[notification.type] ?? notification.title,
    body: NOTIFICATION_BODY_LABELS[notification.body] ?? notification.body,
  };
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

export async function getLatestUnreadNotification(
  userId: string,
  client: DbClient = db,
) {
  const notification = await client.notification.findFirst({
    where: {
      userId,
      readAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
    },
  });

  if (!notification) {
    return null;
  }

  return {
    id: notification.id,
    ...getNotificationDisplayText(notification),
  };
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
    throw new NotificationError("اعلان پیدا نشد.");
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
