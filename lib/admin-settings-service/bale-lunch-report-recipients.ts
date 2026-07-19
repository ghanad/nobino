import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import { AdminSettingsError, assertAdmin, normalizeBaleChatId } from "./shared";

export async function createBaleLunchReportRecipient(input: {
  adminId: string;
  name: string;
  chatId?: string | null;
  userId?: string | null;
}) {
  const name = input.name.trim();
  const chatId = normalizeBaleChatId(input.chatId);
  const userId = input.userId?.trim() || null;

  if (!name) {
    throw new AdminSettingsError("نام گیرنده گزارش غذا الزامی است.");
  }

  if (Boolean(chatId) === Boolean(userId)) {
    throw new AdminSettingsError("یک گفت‌وگوی بله یا یک کاربر متصل را انتخاب کنید.");
  }

  try {
    return await db.$transaction(async (tx) => {
      await assertAdmin(input.adminId, tx);

      if (userId) {
        const user = await tx.user.findFirst({
          where: {
            id: userId,
            active: true,
            deletedAt: null,
            baleConnection: { enabled: true },
          },
          select: { id: true },
        });

        if (!user) {
          throw new AdminSettingsError("کاربر انتخاب‌شده اتصال فعال بله ندارد.");
        }
      }

      const recipient = await tx.baleLunchReportRecipient.create({
        data: {
          name,
          chatId,
          userId,
          active: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: input.adminId,
          entityType: "BaleLunchReportRecipient",
          entityId: recipient.id,
          action: "BALE_LUNCH_REPORT_RECIPIENT_CREATED",
          newValue: {
            active: recipient.active,
            chatId: recipient.chatId,
            name: recipient.name,
            userId: recipient.userId,
          },
        },
      });

      return recipient;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AdminSettingsError("این مقصد قبلاً به‌عنوان گیرنده ثبت شده است.");
    }

    throw error;
  }
}

export async function updateBaleLunchReportRecipient(input: {
  adminId: string;
  recipientId: string;
  name: string;
  chatId?: string | null;
  userId?: string | null;
  active: boolean;
}) {
  const name = input.name.trim();
  const chatId = normalizeBaleChatId(input.chatId);
  const userId = input.userId?.trim() || null;

  if (!name) {
    throw new AdminSettingsError("نام گیرنده گزارش غذا الزامی است.");
  }

  if (Boolean(chatId) === Boolean(userId)) {
    throw new AdminSettingsError("یک گفت‌وگوی بله یا یک کاربر متصل را انتخاب کنید.");
  }

  try {
    return await db.$transaction(async (tx) => {
      await assertAdmin(input.adminId, tx);

      if (userId) {
        const user = await tx.user.findFirst({
          where: {
            id: userId,
            ...(input.active
              ? {
                  active: true,
                  deletedAt: null,
                  baleConnection: { enabled: true },
                }
              : {}),
          },
          select: { id: true },
        });

        if (!user) {
          throw new AdminSettingsError(
            input.active
              ? "کاربر انتخاب‌شده اتصال فعال بله ندارد."
              : "کاربر انتخاب‌شده پیدا نشد.",
          );
        }
      }

      const current = await tx.baleLunchReportRecipient.findUnique({
        where: { id: input.recipientId },
        select: {
          id: true,
          active: true,
          chatId: true,
          name: true,
          userId: true,
        },
      });

      if (!current) {
        throw new AdminSettingsError("گیرنده گزارش غذا پیدا نشد.");
      }

      const updated = await tx.baleLunchReportRecipient.update({
        where: { id: current.id },
        data: {
          active: input.active,
          chatId,
          name,
          userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: input.adminId,
          entityType: "BaleLunchReportRecipient",
          entityId: updated.id,
          action: "BALE_LUNCH_REPORT_RECIPIENT_UPDATED",
          oldValue: current,
          newValue: {
            active: updated.active,
            chatId: updated.chatId,
            name: updated.name,
            userId: updated.userId,
          },
        },
      });

      return updated;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AdminSettingsError("این مقصد قبلاً به‌عنوان گیرنده ثبت شده است.");
    }

    throw error;
  }
}

export async function deleteBaleLunchReportRecipient(input: {
  adminId: string;
  recipientId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.baleLunchReportRecipient.findUnique({
      where: { id: input.recipientId },
      select: {
        id: true,
        active: true,
        chatId: true,
        name: true,
        userId: true,
      },
    });

    if (!current) {
      throw new AdminSettingsError("گیرنده گزارش غذا پیدا نشد.");
    }

    // Keep delivery history while removing its optional link to the recipient.
    await tx.baleLunchReportDelivery.updateMany({
      where: { recipientId: current.id },
      data: { recipientId: null },
    });

    await tx.baleLunchReportRecipient.delete({
      where: { id: current.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "BaleLunchReportRecipient",
        entityId: current.id,
        action: "BALE_LUNCH_REPORT_RECIPIENT_DELETED",
        oldValue: current,
      },
    });
  });
}
