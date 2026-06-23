import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { BaleDeliveryStatus, Prisma } from "@prisma/client";

import {
  getBaleUpdates,
  sendBaleMessage,
  type BaleUpdate,
} from "@/lib/bale-client";
import { db } from "@/lib/db";
import { getNotificationDisplayText } from "@/lib/notification-service";

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 3;
const DELIVERY_BATCH_SIZE = 50;
const MAX_SYNC_ERROR_LENGTH = 500;
const BALE_CHAT_ID_COMMAND_PATTERN = /^\/chatid(?:@\w+)?$/;

export class BaleConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaleConnectionError";
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseBaleConnectToken(text: string): string | null {
  const match = text.trim().match(/^\/connect(?:@\w+)?\s+([A-Za-z0-9_-]{20,})$/);
  return match?.[1] ?? null;
}

export function isBaleChatIdCommand(text: string): boolean {
  return BALE_CHAT_ID_COMMAND_PATTERN.test(text.trim());
}

export async function createBaleLinkToken(userId: string) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);

  await db.$transaction(async (tx) => {
    await tx.baleLinkToken.deleteMany({ where: { userId, usedAt: null } });
    await tx.baleLinkToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });
  });

  return { command: `/connect ${token}`, expiresAt };
}

export async function disconnectBaleAccount(userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.baleConnection.deleteMany({ where: { userId } });
    await tx.baleLinkToken.deleteMany({ where: { userId, usedAt: null } });
  });
}

export async function connectBaleChat(token: string, chatId: string) {
  const now = new Date();

  try {
    return await db.$transaction(async (tx) => {
      const linkToken = await tx.baleLinkToken.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: { select: { active: true, name: true } } },
      });

      if (
        !linkToken ||
        linkToken.usedAt ||
        linkToken.expiresAt <= now ||
        !linkToken.user.active
      ) {
        throw new BaleConnectionError("کد اتصال نامعتبر یا منقضی شده است.");
      }

      await tx.baleNotificationDelivery.updateMany({
        where: {
          status: { in: [BaleDeliveryStatus.FAILED, BaleDeliveryStatus.SENDING] },
          notification: { userId: linkToken.userId },
        },
        data: { status: BaleDeliveryStatus.SKIPPED },
      });
      const existingNotifications = await tx.notification.findMany({
        where: { userId: linkToken.userId, baleDelivery: null },
        select: { id: true },
      });

      if (existingNotifications.length > 0) {
        await tx.baleNotificationDelivery.createMany({
          data: existingNotifications.map((notification) => ({
            notificationId: notification.id,
            chatId,
            status: BaleDeliveryStatus.SKIPPED,
            attempts: 0,
          })),
        });
      }

      await tx.baleConnection.upsert({
        where: { userId: linkToken.userId },
        update: { chatId, enabled: true, linkedAt: now },
        create: { userId: linkToken.userId, chatId, linkedAt: now },
      });
      await tx.baleLinkToken.update({
        where: { id: linkToken.id },
        data: { usedAt: now },
      });

      return { name: linkToken.user.name };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new BaleConnectionError(
        "این حساب بله قبلاً به کاربر دیگری متصل شده است.",
      );
    }

    throw error;
  }
}

async function replySafely(chatId: string, text: string): Promise<void> {
  try {
    await sendBaleMessage(chatId, text);
  } catch (error) {
    console.error("Bale bot reply failed", error);
  }
}

async function processBaleUpdate(update: BaleUpdate): Promise<boolean> {
  const message = update.message;

  if (!message?.text || message.chat.type !== "private") {
    return false;
  }

  const chatId = String(message.chat.id);

  if (isBaleChatIdCommand(message.text)) {
    await replySafely(
      chatId,
      `شناسه گفت‌وگوی خصوصی شما در بله:\n${chatId}`,
    );
    return false;
  }

  const token = parseBaleConnectToken(message.text);

  if (!token) {
    if (message.text.trim().startsWith("/start")) {
      await replySafely(
        chatId,
        "اگر حساب Nobino دارید، کد اتصال را از بخش تنظیمات بله در Nobino بگیرید و برای بات بفرستید. اگر فقط می‌خواهید شناسه گفت‌وگوی خصوصی خود را ببینید، /chatid را ارسال کنید.",
      );
    }

    return false;
  }

  try {
    const connection = await connectBaleChat(token, chatId);
    await replySafely(
      chatId,
      `${connection.name}، حساب بله شما با موفقیت به Nobino متصل شد.`,
    );
    return true;
  } catch (error) {
    await replySafely(
      chatId,
      error instanceof BaleConnectionError
        ? error.message
        : "اتصال حساب انجام نشد. لطفاً کد جدیدی از Nobino دریافت کنید.",
    );
    return false;
  }
}

export async function consumeBaleUpdates() {
  const state = await db.baleBotState.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  const updates = await getBaleUpdates(state.updateOffset);
  let connected = 0;

  for (const update of updates.sort((a, b) => a.update_id - b.update_id)) {
    if (await processBaleUpdate(update)) {
      connected += 1;
    }

    await db.baleBotState.update({
      where: { id: "default" },
      data: { updateOffset: update.update_id + 1 },
    });
  }

  return { connected, updates: updates.length };
}

export async function recordBaleSyncStarted(): Promise<void> {
  await db.baleBotState.upsert({
    where: { id: "default" },
    update: { lastSyncStartedAt: new Date() },
    create: { id: "default", lastSyncStartedAt: new Date() },
  });
}

export async function recordBaleSyncSucceeded(): Promise<void> {
  await db.baleBotState.upsert({
    where: { id: "default" },
    update: {
      lastSyncError: null,
      lastSyncSucceededAt: new Date(),
    },
    create: {
      id: "default",
      lastSyncSucceededAt: new Date(),
    },
  });
}

export async function recordBaleSyncFailed(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown Bale sync error";

  await db.baleBotState.upsert({
    where: { id: "default" },
    update: {
      lastSyncError: message.slice(0, MAX_SYNC_ERROR_LENGTH),
      lastSyncFailedAt: new Date(),
    },
    create: {
      id: "default",
      lastSyncError: message.slice(0, MAX_SYNC_ERROR_LENGTH),
      lastSyncFailedAt: new Date(),
    },
  });
}

function buildNotificationMessage(notification: {
  type: string;
  title: string;
  body: string;
}): string {
  const display = getNotificationDisplayText(notification);
  return display.body || display.title;
}

async function sendClaimedDelivery(input: {
  deliveryId: string;
  chatId: string;
  notification: { type: string; title: string; body: string };
}): Promise<boolean> {
  try {
    await sendBaleMessage(
      input.chatId,
      buildNotificationMessage(input.notification),
    );
    await db.baleNotificationDelivery.update({
      where: { id: input.deliveryId },
      data: { status: BaleDeliveryStatus.SENT, sentAt: new Date(), lastError: null },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Bale error";
    await db.baleNotificationDelivery.update({
      where: { id: input.deliveryId },
      data: {
        status: BaleDeliveryStatus.FAILED,
        lastError: message.slice(0, 500),
      },
    });
    return false;
  }
}

export async function deliverPendingBaleNotifications() {
  const connections = await db.baleConnection.findMany({
    where: { enabled: true, user: { active: true } },
    select: { chatId: true, linkedAt: true, userId: true },
  });

  if (connections.length === 0) {
    return { failed: 0, sent: 0 };
  }

  const chatIdByUserId = new Map(
    connections.map((connection) => [connection.userId, connection.chatId]),
  );
  const freshNotifications = await db.notification.findMany({
    where: {
      baleDelivery: null,
      OR: connections.map((connection) => ({
        userId: connection.userId,
        createdAt: { gte: connection.linkedAt },
      })),
    },
    orderBy: { createdAt: "asc" },
    take: DELIVERY_BATCH_SIZE,
    select: { id: true, userId: true, type: true, title: true, body: true },
  });
  const failedDeliveries = await db.baleNotificationDelivery.findMany({
    where: {
      status: BaleDeliveryStatus.FAILED,
      attempts: { lt: MAX_DELIVERY_ATTEMPTS },
      notification: { userId: { in: connections.map(({ userId }) => userId) } },
    },
    orderBy: { updatedAt: "asc" },
    take: Math.max(0, DELIVERY_BATCH_SIZE - freshNotifications.length),
    include: {
      notification: { select: { userId: true, type: true, title: true, body: true } },
    },
  });
  let sent = 0;
  let failed = 0;

  for (const notification of freshNotifications) {
    const chatId = chatIdByUserId.get(notification.userId);

    if (!chatId) {
      continue;
    }

    try {
      const delivery = await db.baleNotificationDelivery.create({
        data: { notificationId: notification.id, chatId },
      });
      if (
        await sendClaimedDelivery({ deliveryId: delivery.id, chatId, notification })
      ) {
        sent += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
        throw error;
      }
    }
  }

  for (const delivery of failedDeliveries) {
    const chatId = chatIdByUserId.get(delivery.notification.userId);

    if (!chatId) {
      continue;
    }

    const claimed = await db.baleNotificationDelivery.updateMany({
      where: { id: delivery.id, status: BaleDeliveryStatus.FAILED },
      data: {
        attempts: { increment: 1 },
        chatId,
        status: BaleDeliveryStatus.SENDING,
      },
    });

    if (claimed.count === 0) {
      continue;
    }

    if (
      await sendClaimedDelivery({
        deliveryId: delivery.id,
        chatId,
        notification: delivery.notification,
      })
    ) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return { failed, sent };
}
