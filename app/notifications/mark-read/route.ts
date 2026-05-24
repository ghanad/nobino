import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NotificationError,
} from "@/lib/notification-service";

const markReadSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("single"),
    notificationId: z.string().min(1),
  }),
  z.object({
    mode: z.literal("all"),
  }),
]);

function redirectToNotifications(
  request: NextRequest,
  params: Record<string, string | undefined>,
) {
  const url = new URL("/notifications", request.url);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const user = await requireCurrentUser();
  const formData = await request.formData();
  const parsed = markReadSchema.safeParse({
    mode: formData.get("mode"),
    notificationId: formData.get("notificationId"),
  });

  if (!parsed.success) {
    return redirectToNotifications(request, {
      error: "Choose a valid notification.",
    });
  }

  try {
    if (parsed.data.mode === "single") {
      await markNotificationAsRead({
        notificationId: parsed.data.notificationId,
        userId: user.id,
      });
      revalidatePath("/notifications");

      return redirectToNotifications(request, { read: "1" });
    }

    await markAllNotificationsAsRead(user.id);
    revalidatePath("/notifications");

    return redirectToNotifications(request, { allRead: "1" });
  } catch (error) {
    if (error instanceof NotificationError) {
      return redirectToNotifications(request, { error: error.message });
    }

    throw error;
  }
}
