import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUserFromSessionToken } from "@/lib/auth";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NotificationError,
} from "@/lib/notification-service";
import { SESSION_COOKIE_NAME } from "@/lib/session";

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
  params: Record<string, string | undefined>,
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  return new NextResponse(null, {
    status: 303,
    headers: { Location: query ? `/notifications?${query}` : "/notifications" },
  });
}

function redirectToLogin() {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/login" },
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!user) {
    return redirectToLogin();
  }

  const formData = await request.formData();
  const parsed = markReadSchema.safeParse({
    mode: formData.get("mode"),
    filter: formData.get("filter") || undefined,
    notificationId: formData.get("notificationId"),
    page: formData.get("page") || undefined,
  });

  if (!parsed.success) {
    return redirectToNotifications({
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

      return redirectToNotifications({ filter, page });
    }

    await markAllNotificationsAsRead(user.id);
    revalidatePath("/notifications");

    return redirectToNotifications({ filter, page });
  } catch (error) {
    if (error instanceof NotificationError) {
      return redirectToNotifications({
        error: error.message,
        filter,
        page,
      });
    }

    throw error;
  }
}
