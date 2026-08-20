import { ReservationStatus, UserRole, type Prisma } from "@prisma/client";
import {
  Bell,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Circle,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { MarkNotificationsReadForm } from "@/components/notifications/mark-notifications-read-form";
import { Button } from "@/components/ui/button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateParam,
} from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

const NOTIFICATIONS_PAGE_SIZE = 10;
const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");
const DISPLAY_TIME_FORMATTER = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
});
const NOTIFICATION_FILTERS = [
  "all",
  "unread",
  "actionable",
  "reservations",
] as const;

type NotificationsPageProps = {
  searchParams?: Promise<{
    error?: string;
    filter?: string;
    page?: string;
  }>;
};

type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

type NotificationItem = {
  id: string;
  surveyId: string | null;
  type: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  reservation: {
    id: string;
    startAt: Date;
    endAt: Date;
    status: ReservationStatus;
    resourcePool: {
      name: string;
    };
    user: {
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

  return null;
}

function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

function formatDisplayTime(date: Date): string {
  return DISPLAY_TIME_FORMATTER.format(date);
}

function getNotificationsPage(value: string | undefined): number {
  const parsedPage = Number(value);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return parsedPage;
}

function getNotificationsPageHref(page: number, filter: NotificationFilter): string {
  const params = new URLSearchParams();

  if (filter !== "all") {
    params.set("filter", filter);
  }

  if (page > 1) {
    params.set("page", page.toString());
  }

  const query = params.toString();

  return query ? `/notifications?${query}` : "/notifications";
}

function NotificationsPagination({
  currentPage,
  filter,
  totalPages,
}: {
  currentPage: number;
  filter: NotificationFilter;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {currentPage > 1 ? (
        <Button asChild size="sm" variant="outline">
          <Link href={getNotificationsPageHref(currentPage - 1, filter)}>
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
          <Link href={getNotificationsPageHref(currentPage + 1, filter)}>
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

function getActiveFilter(value: string | undefined): NotificationFilter {
  return NOTIFICATION_FILTERS.includes(value as NotificationFilter)
    ? (value as NotificationFilter)
    : "all";
}

function buildNotificationsWhere(
  filter: NotificationFilter,
  userId: string,
): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = { userId };

  if (filter === "unread") {
    where.readAt = null;
  }

  if (filter === "reservations") {
    where.reservationId = { not: null };
  }

  if (filter === "actionable") {
    where.OR = [
      {
        type: "NEW_PENDING_RESERVATION",
        reservation: { status: ReservationStatus.PENDING },
      },
      {
        type: "ALTERNATIVE_PROPOSED",
        reservation: { status: ReservationStatus.ALTERNATIVE_PROPOSED },
      },
    ];
  }

  return where;
}

function getFilterLabel(filter: NotificationFilter): string {
  if (filter === "unread") {
    return "خوانده‌نشده";
  }

  if (filter === "actionable") {
    return "نیازمند اقدام";
  }

  if (filter === "reservations") {
    return "رزروها";
  }

  return "همه";
}

function NotificationFilters({
  activeFilter,
}: {
  activeFilter: NotificationFilter;
}) {
  return (
    <nav aria-label="فیلتر اعلان‌ها" className="flex flex-wrap gap-2">
      {NOTIFICATION_FILTERS.map((filter) => {
        const isActive = filter === activeFilter;

        return (
          <Link
            className={cn(
              "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
            href={getNotificationsPageHref(1, filter)}
            key={filter}
          >
            {getFilterLabel(filter)}
          </Link>
        );
      })}
    </nav>
  );
}

function getTypeBadge(notification: NotificationItem): {
  className: string;
  label: string;
} {
  if (notification.type === "NEW_PENDING_RESERVATION") {
    return {
      className: "bg-amber-50 text-amber-800 ring-amber-200",
      label: "درخواست جدید",
    };
  }

  if (notification.type === "RESERVATION_APPROVED") {
    return {
      className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
      label: "رزرو تایید شد",
    };
  }

  if (notification.type === "RESERVATION_AUTO_APPROVED") {
    return {
      className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
      label: "رزرو تایید شد",
    };
  }

  if (notification.type === "RESERVATION_REJECTED") {
    return {
      className: "bg-rose-50 text-rose-800 ring-rose-200",
      label: "رزرو رد شد",
    };
  }

  if (notification.type === "RESERVATION_CANCELLED") {
    return {
      className: "bg-slate-100 text-slate-700 ring-slate-200",
      label: "رزرو لغو شد",
    };
  }

  if (
    notification.type === "SURVEY_INVITATION" ||
    notification.type === "SURVEY_REMINDER"
  ) {
    return {
      className: "bg-violet-50 text-violet-800 ring-violet-200",
      label:
        notification.type === "SURVEY_REMINDER"
          ? "یادآوری نظرسنجی"
          : "دعوت به نظرسنجی",
    };
  }

  if (
    notification.type === "ALTERNATIVE_PROPOSED" ||
    notification.type === "ALTERNATIVE_ACCEPTED" ||
    notification.type === "ALTERNATIVE_REJECTED"
  ) {
    return {
      className: "bg-sky-50 text-sky-800 ring-sky-200",
      label:
        notification.type === "ALTERNATIVE_PROPOSED"
          ? "زمان جایگزین پیشنهاد شد"
          : notification.type === "ALTERNATIVE_ACCEPTED"
            ? "زمان پیشنهادی پذیرفته شد"
            : "زمان پیشنهادی رد شد",
    };
  }

  return {
    className: "bg-muted text-muted-foreground ring-border",
    label: "اعلان سیستمی",
  };
}

function ReservationInfo({ notification }: { notification: NotificationItem }) {
  if (!notification.reservation) {
    return null;
  }

  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-muted-foreground sm:text-sm">
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      <bdi className="min-w-0 truncate" dir="auto">
        {notification.reservation.resourcePool.name}
      </bdi>
      <span aria-hidden="true">·</span>
      <span>{formatJalaliDate(notification.reservation.startAt)}</span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex flex-row items-center gap-1" dir="ltr">
        <span>{formatDisplayTime(notification.reservation.startAt)}</span>
        <span dir="rtl">تا</span>
        <span>{formatDisplayTime(notification.reservation.endAt)}</span>
      </span>
    </p>
  );
}

function getNotificationMessage(notification: NotificationItem): ReactNode {
  const poolName = notification.reservation?.resourcePool.name;
  const requesterName = notification.reservation?.user.name;

  if (
    notification.type === "NEW_PENDING_RESERVATION" &&
    poolName &&
    requesterName
  ) {
    return (
      <>
        <bdi>{requesterName}</bdi> برای <bdi>{poolName}</bdi> درخواست رزرو ثبت کرده
        است.
      </>
    );
  }

  if (notification.type === "RESERVATION_APPROVED" && poolName) {
    return (
      <>
        رزرو شما برای <bdi>{poolName}</bdi> تایید شد.
      </>
    );
  }

  if (notification.type === "RESERVATION_AUTO_APPROVED" && poolName) {
    return (
      <>
        رزرو شما برای <bdi>{poolName}</bdi> تایید شد.
      </>
    );
  }

  if (notification.type === "RESERVATION_REJECTED" && poolName) {
    return (
      <>
        درخواست رزرو شما برای <bdi>{poolName}</bdi> رد شد.
      </>
    );
  }

  if (notification.type === "RESERVATION_CANCELLED" && poolName) {
    return (
      <>
        رزرو مربوط به <bdi>{poolName}</bdi> لغو شد.
      </>
    );
  }

  if (notification.type === "ALTERNATIVE_PROPOSED" && poolName) {
    return (
      <>
        مدیر برای رزرو <bdi>{poolName}</bdi> یک زمان جایگزین پیشنهاد داده است.
      </>
    );
  }

  if (notification.type === "RESERVATION_TIME_UPDATED" && poolName) {
    if (notification.reservation?.status === ReservationStatus.APPROVED) {
      return (
        <>
          مدیر زمان رزرو تاییدشده شما برای <bdi>{poolName}</bdi> را تغییر داد.
        </>
      );
    }

    return (
      <>
        مدیر زمان درخواست رزرو شما برای <bdi>{poolName}</bdi> را تغییر داد.
        درخواست هنوز در انتظار تایید است.
      </>
    );
  }

  if (notification.type === "ALTERNATIVE_ACCEPTED" && poolName && requesterName) {
    return (
      <>
        <bdi>{requesterName}</bdi> زمان جایگزین پیشنهادی برای <bdi>{poolName}</bdi>{" "}
        را پذیرفت.
      </>
    );
  }

  if (notification.type === "ALTERNATIVE_REJECTED" && poolName && requesterName) {
    return (
      <>
        <bdi>{requesterName}</bdi> زمان جایگزین پیشنهادی برای <bdi>{poolName}</bdi>{" "}
        را رد کرد.
      </>
    );
  }

  return notification.body;
}

function getNotificationAction(
  notification: NotificationItem,
  role: UserRole,
): { href: string; label: string; variant: "default" | "outline" } | null {
  if (
    (notification.type === "SURVEY_INVITATION" ||
      notification.type === "SURVEY_REMINDER") &&
    notification.surveyId
  ) {
    return {
      href: `/surveys/${encodeURIComponent(notification.surveyId)}`,
      label: "مشاهده نظرسنجی",
      variant: "default",
    };
  }

  if (!notification.reservation) {
    return null;
  }

  const reservationDate = formatJalaliDateParam(notification.reservation.startAt);

  if (
    (role === UserRole.MANAGER || role === UserRole.ADMIN) &&
    notification.type === "NEW_PENDING_RESERVATION" &&
    notification.reservation.status === ReservationStatus.PENDING
  ) {
    return {
      href: `/manager?date=${encodeURIComponent(reservationDate)}#review-reservation-${
        notification.reservation.id
      }`,
      label: "بررسی درخواست",
      variant: "default",
    };
  }

  if (
    notification.type === "ALTERNATIVE_PROPOSED" &&
    notification.reservation.status === ReservationStatus.ALTERNATIVE_PROPOSED
  ) {
    return {
      href: "/reservations",
      label: "بررسی پیشنهاد",
      variant: "default",
    };
  }

  if (role === UserRole.USER) {
    return {
      href: "/reservations/history",
      label: "مشاهده رزرو",
      variant: "outline",
    };
  }

  if (
    notification.reservation.status === ReservationStatus.PENDING ||
    notification.reservation.status === ReservationStatus.APPROVED
  ) {
    return {
      href: `/manager?date=${encodeURIComponent(reservationDate)}#review-reservation-${
        notification.reservation.id
      }`,
      label: "مشاهده رزرو",
      variant: "outline",
    };
  }

  return null;
}

function NotificationCard({
  notification,
  userRole,
}: {
  notification: NotificationItem;
  userRole: UserRole;
}) {
  const badge = getTypeBadge(notification);
  const action = getNotificationAction(notification, userRole);
  const isUnread = !notification.readAt;

  return (
    <article
      className={cn(
        "rounded-lg border p-3 text-right transition-colors sm:p-3.5",
        isUnread
          ? "border-sky-300 border-r-4 bg-sky-50/80 shadow-sm"
          : "bg-card",
      )}
      dir="rtl"
    >
      <div className="grid gap-2">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {isUnread ? (
              <Circle className="h-3 w-3 fill-sky-600 text-sky-600" />
            ) : null}
            <span
              className={cn(
                "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                badge.className,
              )}
            >
              {badge.label}
            </span>
            {isUnread ? (
              <span className="inline-flex w-fit rounded-full bg-sky-600 px-2 py-0.5 text-xs font-medium text-white">
                خوانده‌نشده
              </span>
            ) : null}
          </div>
          <time
            className="text-xs leading-5 text-muted-foreground"
            dateTime={notification.createdAt.toISOString()}
          >
            {formatJalaliDate(notification.createdAt)} ·{" "}
            {formatDisplayTime(notification.createdAt)}
          </time>
        </div>

        <div className="grid gap-1.5">
          <p className="text-sm leading-6 text-foreground">
            {getNotificationMessage(notification)}
          </p>
          <ReservationInfo notification={notification} />
        </div>

        {(action || isUnread) ? (
          <div className="flex flex-wrap items-center gap-2">
            {action ? (
              <Button asChild size="sm" variant={action.variant}>
                <Link href={action.href}>
                  <Bell className="h-4 w-4" />
                  {action.label}
                </Link>
              </Button>
            ) : null}
            {isUnread ? (
              <MarkNotificationsReadForm mode="single" notificationId={notification.id} />
            ) : null}
          </div>
        ) : null}
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
  const activeFilter = getActiveFilter(params?.filter);
  const where = buildNotificationsWhere(activeFilter, user.id);
  const [unreadCount, filteredNotifications] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.notification.count({ where }),
  ]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredNotifications / NOTIFICATIONS_PAGE_SIZE),
  );
  const currentPage = Math.min(requestedPage, totalPages);
  const firstNotificationNumber =
    filteredNotifications === 0
      ? 0
      : (currentPage - 1) * NOTIFICATIONS_PAGE_SIZE + 1;
  const lastNotificationNumber = Math.min(
    currentPage * NOTIFICATIONS_PAGE_SIZE,
    filteredNotifications,
  );
  const notifications = await db.notification.findMany({
    where,
    orderBy:
      unreadCount === 0
        ? [{ createdAt: "desc" }]
        : [{ readAt: "asc" }, { createdAt: "desc" }],
    skip: (currentPage - 1) * NOTIFICATIONS_PAGE_SIZE,
    take: NOTIFICATIONS_PAGE_SIZE,
    select: {
      id: true,
      surveyId: true,
      type: true,
      body: true,
      readAt: true,
      createdAt: true,
      reservation: {
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          resourcePool: {
            select: {
              name: true,
            },
          },
          user: {
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
      <PageHeader
        subtitle="پیگیری تغییرات و وضعیت درخواست‌های رزرو"
        title="اعلان‌ها"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <section className="grid gap-5 rounded-lg border bg-card p-5 text-card-foreground">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-medium">مرکز اعلان‌ها</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatPersianNumber(unreadCount)} اعلان خوانده‌نشده دارید.
            </p>
          </div>
          {unreadCount > 0 ? (
            <MarkNotificationsReadForm mode="all" />
          ) : null}
        </div>

        <NotificationFilters activeFilter={activeFilter} />

        {notifications.length === 0 ? (
          <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {activeFilter === "unread"
                ? "اعلان خوانده‌نشده‌ای ندارید."
                : "اعلانی وجود ندارد."}
            </p>
            {activeFilter === "unread" ? null : (
              <p className="mt-1">
                وقتی وضعیت رزروها تغییر کند، اینجا نمایش داده می‌شود.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="text-sm text-muted-foreground">
              <p>
                نمایش {formatPersianNumber(firstNotificationNumber)} تا{" "}
                {formatPersianNumber(lastNotificationNumber)} از{" "}
                {formatPersianNumber(filteredNotifications)} اعلان
              </p>
            </div>

            <div className="grid gap-3">
              {notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  userRole={user.role}
                />
              ))}
            </div>

            <NotificationsPagination
              currentPage={currentPage}
              filter={activeFilter}
              totalPages={totalPages}
            />
          </div>
        )}
      </section>
    </div>
  );
}
