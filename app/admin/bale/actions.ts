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
  updateBaleLunchReportRecipient,
} from "@/lib/admin-settings-service";

const createRecipientSchema = z.object({
  chatId: z.string().trim().max(100).optional(),
  destinationType: z.enum(["chat", "user"]),
  name: z.string().trim().min(1).max(100),
  userId: z.string().trim().optional(),
}).superRefine((value, context) => {
  if (value.destinationType === "chat" && !value.chatId) {
    context.addIssue({ code: "custom", message: "chatId is required", path: ["chatId"] });
  }

  if (value.destinationType === "user" && !value.userId) {
    context.addIssue({ code: "custom", message: "userId is required", path: ["userId"] });
  }
});

const updateRecipientSchema = z.intersection(createRecipientSchema, z.object({
  active: z.coerce.boolean(),
  recipientId: z.string().min(1),
}));

function redirectToBaleAdmin(params: Record<string, string | undefined>): never {
  redirectToPath("/admin/bale", params);
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
    redirectToBaleAdmin({ error: "گیرنده گزارش ناهار معتبر نیست." });
  }

  try {
    await createBaleLunchReportRecipient({
      adminId: admin.id,
      chatId: parsed.data.destinationType === "chat" ? parsed.data.chatId : null,
      name: parsed.data.name,
      userId: parsed.data.destinationType === "user" ? parsed.data.userId : null,
    });
  } catch (error) {
    redirectToBaleAdmin({ error: getActionErrorMessage(error) });
  }

  redirectToBaleAdmin({ recipientCreated: "1" });
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
    redirectToBaleAdmin({ error: "گیرنده گزارش ناهار معتبر نیست." });
  }

  try {
    await updateBaleLunchReportRecipient({
      adminId: admin.id,
      active: parsed.data.active,
      chatId: parsed.data.destinationType === "chat" ? parsed.data.chatId : null,
      name: parsed.data.name,
      recipientId: parsed.data.recipientId,
      userId: parsed.data.destinationType === "user" ? parsed.data.userId : null,
    });
  } catch (error) {
    redirectToBaleAdmin({ error: getActionErrorMessage(error) });
  }

  redirectToBaleAdmin({ recipientUpdated: "1" });
}
