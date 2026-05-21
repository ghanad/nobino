"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NotificationError,
} from "@/lib/notification-service";

const notificationIdSchema = z.object({
  notificationId: z.string().min(1),
});

function redirectToNotifications(params: Record<string, string | undefined>): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  redirect(`/notifications?${searchParams.toString()}`);
}

export async function markNotificationAsReadAction(
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const parsed = notificationIdSchema.safeParse({
    notificationId: formData.get("notificationId"),
  });

  if (!parsed.success) {
    redirectToNotifications({ error: "Choose a valid notification." });
  }

  try {
    await markNotificationAsRead({
      notificationId: parsed.data.notificationId,
      userId: user.id,
    });
  } catch (error) {
    if (error instanceof NotificationError) {
      redirectToNotifications({ error: error.message });
    }

    throw error;
  }

  revalidatePath("/notifications");
  redirectToNotifications({ read: "1" });
}

export async function markAllNotificationsAsReadAction(): Promise<void> {
  const user = await requireCurrentUser();

  await markAllNotificationsAsRead(user.id);
  revalidatePath("/notifications");
  redirectToNotifications({ allRead: "1" });
}
