"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import {
  checkboxToBoolean,
  emptyToUndefined,
  getActionErrorMessage,
  redirectToPath,
} from "@/app/admin/_actions/shared";
import { requireRole } from "@/lib/auth";
import {
  createBaleLunchReportRecipient,
  deleteBaleLunchReportRecipient,
  normalizeBaleChatId,
  updateBaleLunchReportRecipient,
} from "@/lib/admin-settings-service";
import { sendBaleLunchReportNow } from "@/lib/bale-lunch-report-service";
import { updateLunchReportSettings } from "@/lib/lunch-service";

const createRecipientSchema = z
  .object({
    chatId: z.string().trim().optional(),
    destinationType: z.enum(["chat", "user"]),
    name: z.string().trim().min(1).max(100),
    userId: z.string().trim().optional(),
  });

const updateRecipientSchema = z.intersection(
  createRecipientSchema,
  z.object({
    active: z.coerce.boolean(),
    recipientId: z.string().min(1),
  }),
);

const deleteRecipientSchema = z.object({
  recipientId: z.string().min(1),
});

const reportSettingsSchema = z.object({
  includeBreakfastNamesInReport: z.boolean(),
  includeLunchNamesInReport: z.boolean(),
});

function redirectToLunchNotifications(
  params: Record<string, string | undefined>,
): never {
  redirectToPath("/admin/lunch-notifications", params);
}

export async function createBaleLunchReportRecipientAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = createRecipientSchema.safeParse({
    chatId: emptyToUndefined(formData.get("chatId")),
    destinationType: formData.get("destinationType"),
    name: formData.get("name"),
    userId: emptyToUndefined(formData.get("userId")),
  });

  if (!parsed.success) {
    redirectToLunchNotifications({ error: "گیرنده گزارش غذا معتبر نیست." });
  }

  let chatId: string | null = null;

  try {
    if (parsed.data.destinationType === "chat") {
      chatId = normalizeBaleChatId(parsed.data.chatId);

      if (!chatId) {
        redirectToLunchNotifications({ error: "شناسه گفت‌وگوی بله معتبر نیست." });
      }
    }
  } catch (error) {
    redirectToLunchNotifications({ error: getActionErrorMessage(error) });
  }

  try {
    await createBaleLunchReportRecipient({
      adminId: admin.id,
      chatId,
      name: parsed.data.name,
      userId: parsed.data.destinationType === "user" ? parsed.data.userId : null,
    });
  } catch (error) {
    redirectToLunchNotifications({ error: getActionErrorMessage(error) });
  }

  redirectToLunchNotifications({ recipientCreated: "1" });
}

export async function updateBaleLunchReportRecipientAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = updateRecipientSchema.safeParse({
    active: checkboxToBoolean(formData.get("active")),
    chatId: emptyToUndefined(formData.get("chatId")),
    destinationType: formData.get("destinationType"),
    name: formData.get("name"),
    recipientId: formData.get("recipientId"),
    userId: emptyToUndefined(formData.get("userId")),
  });

  if (!parsed.success) {
    redirectToLunchNotifications({ error: "گیرنده گزارش غذا معتبر نیست." });
  }

  let chatId: string | null = null;

  try {
    if (parsed.data.destinationType === "chat") {
      chatId = normalizeBaleChatId(parsed.data.chatId);

      if (!chatId) {
        redirectToLunchNotifications({ error: "شناسه گفت‌وگوی بله معتبر نیست." });
      }
    }
  } catch (error) {
    redirectToLunchNotifications({ error: getActionErrorMessage(error) });
  }

  try {
    await updateBaleLunchReportRecipient({
      adminId: admin.id,
      active: parsed.data.active,
      chatId,
      name: parsed.data.name,
      recipientId: parsed.data.recipientId,
      userId: parsed.data.destinationType === "user" ? parsed.data.userId : null,
    });
  } catch (error) {
    redirectToLunchNotifications({ error: getActionErrorMessage(error) });
  }

  redirectToLunchNotifications({ recipientUpdated: "1" });
}

export async function deleteBaleLunchReportRecipientAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = deleteRecipientSchema.safeParse({
    recipientId: formData.get("recipientId"),
  });

  if (!parsed.success) {
    redirectToLunchNotifications({ error: "گیرنده گزارش غذا معتبر نیست." });
  }

  try {
    await deleteBaleLunchReportRecipient({
      adminId: admin.id,
      recipientId: parsed.data.recipientId,
    });
  } catch (error) {
    redirectToLunchNotifications({ error: getActionErrorMessage(error) });
  }

  redirectToLunchNotifications({ recipientDeleted: "1" });
}

export async function sendBaleLunchReportNowAction(): Promise<void> {
  await requireRole([UserRole.ADMIN]);
  let result: Awaited<ReturnType<typeof sendBaleLunchReportNow>>;

  try {
    result = await sendBaleLunchReportNow();
  } catch (error) {
    redirectToLunchNotifications({ error: getActionErrorMessage(error) });
  }

  if (!result.configured) {
    redirectToLunchNotifications({ error: "هیچ گیرنده فعالی برای ارسال گزارش وجود ندارد." });
  }

  if (result.failed > 0) {
    redirectToLunchNotifications({
      manualFailed: String(result.failed),
      manualSent: String(result.sent),
    });
  }

  redirectToLunchNotifications({ manualSent: String(result.sent) });
}

export async function updateLunchReportSettingsAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = reportSettingsSchema.safeParse({
    includeBreakfastNamesInReport: checkboxToBoolean(
      formData.get("includeBreakfastNamesInReport"),
    ),
    includeLunchNamesInReport: checkboxToBoolean(
      formData.get("includeLunchNamesInReport"),
    ),
  });

  if (!parsed.success) {
    redirectToLunchNotifications({ error: "تنظیمات محتوای گزارش معتبر نیست." });
  }

  try {
    await updateLunchReportSettings({ adminId: admin.id, ...parsed.data });
  } catch (error) {
    redirectToLunchNotifications({ error: getActionErrorMessage(error) });
  }

  redirectToLunchNotifications({ reportSettingsUpdated: "1" });
}
