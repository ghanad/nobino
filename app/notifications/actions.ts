"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NotificationError,
} from "@/lib/notification-service";

const markReadSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("single"), notificationId: z.string().min(1) }),
  z.object({ mode: z.literal("all") }),
]);

export type MarkNotificationsReadActionState = {
  message: string;
  status: "error" | "idle" | "success";
};

export async function markNotificationsReadAction(
  _previousState: MarkNotificationsReadActionState,
  formData: FormData,
): Promise<MarkNotificationsReadActionState> {
  const user = await requireCurrentUser();
  const parsed = markReadSchema.safeParse({
    mode: formData.get("mode"),
    notificationId: formData.get("notificationId"),
  });

  if (!parsed.success) {
    return { message: "اعلان معتبر انتخاب نشده است.", status: "error" };
  }

  try {
    if (parsed.data.mode === "single") {
      await markNotificationAsRead({ notificationId: parsed.data.notificationId, userId: user.id });
    } else {
      await markAllNotificationsAsRead(user.id);
    }
  } catch (error) {
    if (error instanceof NotificationError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }

  revalidatePath("/notifications");
  return {
    message: parsed.data.mode === "single" ? "اعلان خوانده شد." : "همه اعلان‌ها خوانده شدند.",
    status: "success",
  };
}
