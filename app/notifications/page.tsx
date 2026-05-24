import { Check, CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDateTime } from "@/lib/jalali-date";
import { getNotificationDisplayText } from "@/lib/notification-service";

const NOTIFICATIONS_PAGE_SIZE = 10;
const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

type NotificationsPageProps = {
  searchParams?: Promise<{
    allRead?: string;
    error?: string;
    page?: string;
    read?: string;
  }>;
};

type NotificationItem = {
  id: string;
  type: string;
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
    (params?.read && "اعلان به عنوان خوانده شده ثبت شد.") ||
    (params?.allRead && "همه اعلان‌ها به عنوان خوانده شده ثبت شدند.");

  if (!successMessage) {
    return null;
  }

  return {
    consumeKeys: ["read", "allRead"],
    message: successMessage,
    variant: "success" as const,
  };
}

function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

function getNotificationsPage(value: string | undefined): number {
  const parsedPage = Number(value);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return parsedPage;
}

function getNotificationsPageHref(page: number): string {
  if (page <= 1) {
    return "/notifications";
  }

  return `/notifications?page=${page}`;
}

function NotificationsPagination({
  currentPage,
  totalPages,
}: {
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {currentPage > 1 ? (
        <Button asChild size="sm" variant="outline">
          <Link href={getNotificationsPageHref(currentPage - 1)}>
            <ChevronRight className="h-4 w-4" />
            صفحه قبل
          </Link>
        </Button>
      ) : (
        <Button disabled size="sm" variant="outline">
          <ChevronRight className="h-4 w-4" />
          صفحه قبل
        </Button>
      )}
      <span className="text-muted-foreground">
        صفحه {formatPersianNumber(currentPage)} از{" "}
        {formatPersianNumber(totalPages)}
      </span>
      {currentPage < totalPages ? (
        <Button asChild size="sm" variant="outline">
          <Link href={getNotificationsPageHref(currentPage + 1)}>
            صفحه بعد
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <Button disabled size="sm" variant="outline">
          صفحه بعد
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function NotificationCard({
  notification,
  page,
}: {
  notification: NotificationItem;
  page: number;
}) {
  const displayText = getNotificationDisplayText(notification);

  return (
    <article
      className={`rounded-lg border p-5 text-right ${
        notification.readAt ? "bg-card" : "border-sky-200 bg-sky-50/60"
      }`}
      dir="rtl"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{displayText.title}</h3>
            {notification.readAt ? null : (
              <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800 ring-1 ring-sky-200">
                خوانده نشده
              </span>
            )}
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {displayText.body}
          </p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">زمان ایجاد</dt>
              <dd className="mt-1 font-medium">
                {formatJalaliDateTime(notification.createdAt)}
              </dd>
            </div>
            {notification.reservation ? (
              <div>
                <dt className="text-muted-foreground">رزرو</dt>
                <dd className="mt-1 font-medium">
                  {notification.reservation.resourcePool.name}، از{" "}
                  {formatJalaliDateTime(notification.reservation.startAt)} تا{" "}
                  {formatJalaliDateTime(notification.reservation.endAt)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {notification.readAt ? (
          <span className="text-sm text-muted-foreground">
            خوانده شده در {formatJalaliDateTime(notification.readAt)}
          </span>
        ) : (
          <form action="/notifications/mark-read" method="post">
            <input name="mode" type="hidden" value="single" />
            <input name="page" type="hidden" value={page} />
            <input
              name="notificationId"
              type="hidden"
              value={notification.id}
            />
            <Button type="submit" variant="outline">
              <Check className="h-4 w-4" />
              خواندم
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
  const requestedPage = getNotificationsPage(params?.page);
  const [totalNotifications, unreadCount] = await Promise.all([
    db.notification.count({ where: { userId: user.id } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const totalPages = Math.max(
    1,
    Math.ceil(totalNotifications / NOTIFICATIONS_PAGE_SIZE),
  );
  const currentPage = Math.min(requestedPage, totalPages);
  const firstNotificationNumber =
    totalNotifications === 0
      ? 0
      : (currentPage - 1) * NOTIFICATIONS_PAGE_SIZE + 1;
  const lastNotificationNumber = Math.min(
    currentPage * NOTIFICATIONS_PAGE_SIZE,
    totalNotifications,
  );
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    skip: (currentPage - 1) * NOTIFICATIONS_PAGE_SIZE,
    take: NOTIFICATIONS_PAGE_SIZE,
    select: {
      id: true,
      type: true,
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
  const toast = getNotificationsToast(params);

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      {toast ? <UrlToast {...toast} /> : null}

      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-medium">اعلان‌ها</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatPersianNumber(unreadCount)} اعلان خوانده نشده دارید.
            </p>
          </div>
          {unreadCount > 0 ? (
            <form action="/notifications/mark-read" method="post">
              <input name="mode" type="hidden" value="all" />
              <input name="page" type="hidden" value={currentPage} />
              <Button type="submit" variant="outline">
                <CheckCheck className="h-4 w-4" />
                همه را خواندم
              </Button>
            </form>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <p className="mt-5 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            هنوز اعلانی ندارید.
          </p>
        ) : (
          <div className="mt-5 grid gap-4">
            <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                نمایش {formatPersianNumber(firstNotificationNumber)} تا{" "}
                {formatPersianNumber(lastNotificationNumber)} از{" "}
                {formatPersianNumber(totalNotifications)} اعلان
              </p>
              <NotificationsPagination
                currentPage={currentPage}
                totalPages={totalPages}
              />
            </div>

            <div className="grid gap-3">
              {notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  page={currentPage}
                />
              ))}
            </div>

            <NotificationsPagination
              currentPage={currentPage}
              totalPages={totalPages}
            />
          </div>
        )}
      </section>
    </div>
  );
}
