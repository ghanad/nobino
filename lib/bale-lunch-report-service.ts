import "server-only";

import { BaleDeliveryStatus, Prisma } from "@prisma/client";

import { sendBaleMessage } from "@/lib/bale-client";
import { db } from "@/lib/db";
import { formatLunchReportMessage, getLunchReportSummary } from "@/lib/lunch-report-service";
import {
  addDays,
  buildCutoffAt,
  getLunchSettings,
  isLunchServiceDay,
  startOfLocalDay,
} from "@/lib/lunch-service";

const INITIAL_LOOKBACK_MS = 5 * 60 * 1000;
const SENDING_STALE_AFTER_MS = 5 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 3;
const MAX_ERROR_LENGTH = 500;
const RETRY_BATCH_SIZE = 20;

export type BaleLunchReportSyncResult = {
  claimed: number;
  configured: boolean;
  failed: number;
  sent: number;
  skipped: number;
};

type DueReportDate = {
  cutoffAt: Date;
  reportDate: Date;
};

type LunchReportRecipient = {
  id: string;
  chatId: string | null;
  name: string;
  userId: string | null;
};

function buildDeliveryKey(reportDate: Date, recipientId: string): string {
  return `${reportDate.toISOString()}:${recipientId}`;
}

function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown Bale error";

  return message.slice(0, MAX_ERROR_LENGTH);
}

function getDueReportDates(input: {
  cutoffTime: string;
  lastCheckAt: Date | null;
  now: Date;
}): DueReportDate[] {
  const today = startOfLocalDay(input.now);
  const windowStart =
    input.lastCheckAt ?? new Date(input.now.getTime() - INITIAL_LOOKBACK_MS);

  return [today, addDays(today, 1)]
    .map((reportDate) => {
      const cutoffAt = buildCutoffAt(reportDate, input.cutoffTime);
      const eligibleAt = new Date(cutoffAt.getTime() + 60 * 1000);

      return { cutoffAt, eligibleAt, reportDate };
    })
    .filter(
      ({ eligibleAt }) =>
        eligibleAt <= input.now && eligibleAt > windowStart,
    )
    .map(({ cutoffAt, reportDate }) => ({ cutoffAt, reportDate }));
}

async function advanceLastCheck(now: Date): Promise<void> {
  await db.baleBotState.upsert({
    where: { id: "default" },
    update: { lastLunchReportCheckAt: now },
    create: { id: "default", lastLunchReportCheckAt: now },
  });
}

async function createSkippedDelivery(input: {
  cutoffAt: Date;
  reportDate: Date;
  recipient: LunchReportRecipient;
}): Promise<boolean> {
  try {
    await db.baleLunchReportDelivery.create({
      data: {
        attempts: 0,
        chatId: input.recipient.chatId,
        cutoffAt: input.cutoffAt,
        deliveryKey: buildDeliveryKey(input.reportDate, input.recipient.id),
        message: "",
        recipientId: input.recipient.id,
        recipientName: input.recipient.name,
        reportDate: input.reportDate,
        status: BaleDeliveryStatus.SKIPPED,
        totalCount: 0,
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }

    throw error;
  }
}

async function createFreshDelivery(input: {
  cutoffAt: Date;
  message: string;
  reportDate: Date;
  recipient: LunchReportRecipient;
  totalCount: number;
}): Promise<{ id: string } | null> {
  try {
    return await db.baleLunchReportDelivery.create({
      data: {
        attempts: 1,
        chatId: input.recipient.chatId,
        cutoffAt: input.cutoffAt,
        deliveryKey: buildDeliveryKey(input.reportDate, input.recipient.id),
        message: input.message,
        recipientId: input.recipient.id,
        recipientName: input.recipient.name,
        reportDate: input.reportDate,
        status: BaleDeliveryStatus.SENDING,
        totalCount: input.totalCount,
      },
      select: { id: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return null;
    }

    throw error;
  }
}

async function sendClaimedLunchReport(input: {
  deliveryId: string;
  message: string;
}): Promise<boolean> {
  try {
    const delivery = await db.baleLunchReportDelivery.findUnique({
      where: { id: input.deliveryId },
      select: {
        chatId: true,
        recipient: {
          select: {
            chatId: true,
            userId: true,
            user: {
              select: {
                active: true,
                deletedAt: true,
                baleConnection: {
                  select: { chatId: true, enabled: true },
                },
              },
            },
          },
        },
      },
    });

    if (!delivery) {
      throw new Error("Lunch report delivery was not found.");
    }

    let chatId = delivery.recipient?.chatId ?? delivery.chatId;

    if (delivery.recipient?.userId) {
      const user = delivery.recipient.user;

      if (!user?.active || user.deletedAt || !user.baleConnection?.enabled) {
        throw new Error("کاربر گیرنده اتصال فعال بله ندارد.");
      }

      chatId = user.baleConnection.chatId;
    }

    if (!chatId) {
      throw new Error("مقصد بله برای گیرنده گزارش ناهار در دسترس نیست.");
    }

    await sendBaleMessage(chatId, input.message);
    await db.baleLunchReportDelivery.update({
      where: { id: input.deliveryId },
      data: {
        chatId,
        lastError: null,
        sentAt: new Date(),
        status: BaleDeliveryStatus.SENT,
      },
    });
    return true;
  } catch (error) {
    await db.baleLunchReportDelivery.update({
      where: { id: input.deliveryId },
      data: {
        lastError: getErrorMessage(error),
        status: BaleDeliveryStatus.FAILED,
      },
    });
    return false;
  }
}

async function retryPendingDeliveries(input: {
  now: Date;
  syncStartedAt: Date;
}): Promise<{
  failed: number;
  sent: number;
}> {
  const staleBefore = new Date(input.now.getTime() - SENDING_STALE_AFTER_MS);
  const deliveries = await db.baleLunchReportDelivery.findMany({
    where: {
      OR: [
        {
          attempts: { lt: MAX_DELIVERY_ATTEMPTS },
          status: BaleDeliveryStatus.FAILED,
          updatedAt: { lt: input.syncStartedAt },
        },
        {
          attempts: { lt: MAX_DELIVERY_ATTEMPTS },
          status: BaleDeliveryStatus.SENDING,
          updatedAt: { lte: staleBefore },
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: RETRY_BATCH_SIZE,
    select: {
      attempts: true,
      id: true,
      message: true,
      status: true,
      updatedAt: true,
    },
  });
  let failed = 0;
  let sent = 0;

  for (const delivery of deliveries) {
    const claimed = await db.baleLunchReportDelivery.updateMany({
      where: {
        id: delivery.id,
        attempts: delivery.attempts,
        status: delivery.status,
      },
      data: {
        attempts: { increment: 1 },
        lastError: null,
        status: BaleDeliveryStatus.SENDING,
      },
    });

    if (claimed.count === 0) {
      continue;
    }

    if (
      await sendClaimedLunchReport({
        deliveryId: delivery.id,
        message: delivery.message,
      })
    ) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return { failed, sent };
}

export async function syncBaleLunchReports(input?: {
  now?: Date;
}): Promise<BaleLunchReportSyncResult> {
  const now = input?.now ?? new Date();
  const syncStartedAt = new Date();
  const state = await db.baleBotState.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  const settings = await getLunchSettings();
  const result: BaleLunchReportSyncResult = {
    claimed: 0,
    configured: false,
    failed: 0,
    sent: 0,
    skipped: 0,
  };
  const dueDates = getDueReportDates({
    cutoffTime: settings.cutoffTime,
    lastCheckAt: state.lastLunchReportCheckAt,
    now,
  });
  const recipients = await db.baleLunchReportRecipient.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      chatId: true,
      id: true,
      name: true,
      userId: true,
    },
  });

  if (recipients.length === 0) {
    await advanceLastCheck(now);
    return result;
  }

  result.configured = true;

  for (const dueDate of dueDates) {
    if (!settings.enabled || !(await isLunchServiceDay(dueDate.reportDate))) {
      for (const recipient of recipients) {
        if (
          await createSkippedDelivery({
            cutoffAt: dueDate.cutoffAt,
            recipient,
            reportDate: dueDate.reportDate,
          })
        ) {
          result.claimed += 1;
          result.skipped += 1;
        }
      }

      continue;
    }

    const summary = await getLunchReportSummary(dueDate.reportDate);
    const message = formatLunchReportMessage(summary);
    for (const recipient of recipients) {
      const delivery = await createFreshDelivery({
        cutoffAt: dueDate.cutoffAt,
        message,
        recipient,
        reportDate: dueDate.reportDate,
        totalCount: summary.totalCount,
      });

      if (!delivery) {
        continue;
      }

      result.claimed += 1;

      if (
        await sendClaimedLunchReport({
          deliveryId: delivery.id,
          message,
        })
      ) {
        result.sent += 1;
      } else {
        result.failed += 1;
      }
    }
  }

  const retried = await retryPendingDeliveries({ now, syncStartedAt });
  result.sent += retried.sent;
  result.failed += retried.failed;

  await advanceLastCheck(now);

  return result;
}
