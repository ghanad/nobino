import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NotificationError,
} from "@/lib/notification-service";

const notificationFilterSchema = z
  .enum(["all", "unread", "actionable", "reservations"])
  .optional();

const markReadSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("single"),
    notificationId: z.string().min(1),
    filter: notificationFilterSchema,
    page: z.string().optional(),
  }),
  z.object({
    mode: z.literal("all"),
    filter: notificationFilterSchema,
    page: z.string().optional(),
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
    filter: formData.get("filter") || undefined,
    notificationId: formData.get("notificationId"),
    page: formData.get("page") || undefined,
  });

  if (!parsed.success) {
    return redirectToNotifications(request, {
      error: "اعلان معتبر انتخاب نشده است.",
    });
  }

  const page = parsed.data.page;
  const filter = parsed.data.filter === "all" ? undefined : parsed.data.filter;

  try {
    if (parsed.data.mode === "single") {
      await markNotificationAsRead({
        notificationId: parsed.data.notificationId,
        userId: user.id,
      });
      revalidatePath("/notifications");

      return redirectToNotifications(request, { filter, page, read: "1" });
    }

    await markAllNotificationsAsRead(user.id);
    revalidatePath("/notifications");

    return redirectToNotifications(request, { allRead: "1", filter, page });
  } catch (error) {
    if (error instanceof NotificationError) {
      return redirectToNotifications(request, {
        error: error.message,
        filter,
        page,
      });
    }

    throw error;
  }
}
