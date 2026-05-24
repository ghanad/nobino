import { Check, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDateTime } from "@/lib/jalali-date";

type NotificationsPageProps = {
  searchParams?: Promise<{
    allRead?: string;
    error?: string;
    read?: string;
  }>;
};

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  reservation: {
    startAt: Date;
    endAt: Date;
    resourcePool: {
      name: string;
    };
  } | null;
};

function getNotificationsToast(
  params: Awaited<NotificationsPageProps["searchParams"]>,
) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.read && "Notification marked as read.") ||
    (params?.allRead && "All notifications marked as read.");

  if (!successMessage) {
    return null;
  }

  return {
    consumeKeys: ["read", "allRead"],
    message: successMessage,
    variant: "success" as const,
  };
}

function NotificationCard({
  notification,
}: {
  notification: NotificationItem;
}) {
  return (
    <article
      className={`rounded-lg border p-5 ${
        notification.readAt ? "bg-card" : "border-sky-200 bg-sky-50/60"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{notification.title}</h3>
            {notification.readAt ? null : (
              <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800 ring-1 ring-sky-200">
                Unread
              </span>
            )}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {notification.body}
          </p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="mt-1 font-medium">
                {formatJalaliDateTime(notification.createdAt)}
              </dd>
            </div>
            {notification.reservation ? (
              <div>
                <dt className="text-muted-foreground">Reservation</dt>
                <dd className="mt-1 font-medium">
                  {notification.reservation.resourcePool.name},{" "}
                  {formatJalaliDateTime(notification.reservation.startAt)} to{" "}
                  {formatJalaliDateTime(notification.reservation.endAt)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {notification.readAt ? (
          <span className="text-sm text-muted-foreground">
            Read {formatJalaliDateTime(notification.readAt)}
          </span>
        ) : (
          <form action="/notifications/mark-read" method="post">
            <input name="mode" type="hidden" value="single" />
            <input
              name="notificationId"
              type="hidden"
              value={notification.id}
            />
            <Button type="submit" variant="outline">
              <Check className="h-4 w-4" />
              Mark read
            </Button>
          </form>
        )}
      </div>
    </article>
  );
}

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      body: true,
      readAt: true,
      createdAt: true,
      reservation: {
        select: {
          startAt: true,
          endAt: true,
          resourcePool: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
  const unreadCount = notifications.filter(
    (notification) => !notification.readAt,
  ).length;
  const toast = getNotificationsToast(params);

  return (
    <div className="grid gap-6">
      {toast ? <UrlToast {...toast} /> : null}

      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-medium">Unread notifications</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}.
            </p>
          </div>
          {unreadCount > 0 ? (
            <form action="/notifications/mark-read" method="post">
              <input name="mode" type="hidden" value="all" />
              <Button type="submit" variant="outline">
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </Button>
            </form>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <p className="mt-5 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            No notifications yet.
          </p>
        ) : (
          <div className="mt-5 grid gap-3">
            {notifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
