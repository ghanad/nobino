import { BaleDeliveryStatus, UserRole } from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash2,
  Save,
} from "lucide-react";

import {
  createBaleLunchReportRecipientAction,
  updateBaleLunchReportRecipientAction,
} from "@/app/admin/bale/actions";
import { BaleLunchReportRecipientFields } from "@/app/admin/bale/recipient-form-fields";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDate, formatJalaliDateTime } from "@/lib/jalali-date";

const SYNC_STALE_AFTER_MS = 5 * 60 * 1000;
const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

function formatCount(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

function getLunchReportStatusPresentation(status: BaleDeliveryStatus) {
  switch (status) {
    case BaleDeliveryStatus.SENT:
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        label: "ارسال شد",
      };
    case BaleDeliveryStatus.FAILED:
      return {
        className: "border-red-200 bg-red-50 text-red-800",
        label: "ناموفق",
      };
    case BaleDeliveryStatus.SENDING:
      return {
        className: "border-amber-200 bg-amber-50 text-amber-800",
        label: "در حال ارسال",
      };
    case BaleDeliveryStatus.SKIPPED:
      return {
        className: "border-slate-200 bg-slate-50 text-slate-700",
        label: "ارسال نشد",
      };
  }
}

function getSyncHealth(input: {
  configured: boolean;
  failedDeliveries: number;
  lastSyncFailedAt: Date | null;
  lastSyncSucceededAt: Date | null;
}) {
  if (!input.configured) {
    return {
      className: "border-red-200 bg-red-50 text-red-800",
      label: "تنظیمات ناقص",
      message: "توکن بات یا رمز مسیر همگام‌سازی روی سرور تنظیم نشده است.",
    };
  }

  if (
    input.lastSyncFailedAt &&
    (!input.lastSyncSucceededAt || input.lastSyncFailedAt > input.lastSyncSucceededAt)
  ) {
    return {
      className: "border-red-200 bg-red-50 text-red-800",
      label: "آخرین اجرا ناموفق",
      message: "آخرین اجرای همگام‌سازی با خطا متوقف شده است.",
    };
  }

  if (!input.lastSyncSucceededAt) {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-800",
      label: "هنوز بررسی نشده",
      message: "پس از استقرار این قابلیت، هنوز اجرای موفقی ثبت نشده است.",
    };
  }

  if (Date.now() - input.lastSyncSucceededAt.getTime() > SYNC_STALE_AFTER_MS) {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-800",
      label: "همگام‌سازی متوقف است",
      message: "بیش از پنج دقیقه از آخرین اجرای موفق گذشته است؛ زمان‌بند سرور را بررسی کنید.",
    };
  }

  if (input.failedDeliveries > 0) {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-800",
      label: "نیازمند بررسی",
      message: "همگام‌سازی فعال است، اما بعضی پیام‌ها در آخرین تلاش ارسال نشده‌اند.",
    };
  }

  return {
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    label: "سالم",
    message: "اجرای دوره‌ای فعال است و پیام ناموفقی در انتظار بررسی نیست.",
  };
}

function getAdminBaleToast(params: {
  error?: string;
  recipientCreated?: string;
  recipientUpdated?: string;
}) {
  if (params.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  if (params.recipientCreated || params.recipientUpdated) {
    return {
      consumeKeys: [
        params.recipientCreated ? "recipientCreated" : "recipientUpdated",
      ],
      message: "تغییرات گیرنده گزارش ناهار ذخیره شد.",
      variant: "success" as const,
    };
  }

  return null;
}

export default async function AdminBalePage(props: {
  searchParams?: Promise<{
    error?: string;
    recipientCreated?: string;
    recipientUpdated?: string;
  }>;
}) {
  await requireRole([UserRole.ADMIN]);
  const params = (await props.searchParams) ?? {};
  const toast = getAdminBaleToast(params);

  const [
    users,
    botState,
    deliveryCounts,
    latestFailure,
    latestSuccess,
    latestLunchReport,
    lunchReportRecipients,
  ] = await Promise.all([
    db.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        baleConnection: {
          select: { enabled: true, linkedAt: true },
        },
      },
    }),
    db.baleBotState.findUnique({ where: { id: "default" } }),
    db.baleNotificationDelivery.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.baleNotificationDelivery.findFirst({
      where: { status: BaleDeliveryStatus.FAILED },
      orderBy: { updatedAt: "desc" },
      select: {
        attempts: true,
        lastError: true,
        updatedAt: true,
        notification: { select: { user: { select: { name: true } } } },
      },
    }),
    db.baleNotificationDelivery.findFirst({
      where: { status: BaleDeliveryStatus.SENT },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
    db.baleLunchReportDelivery.findFirst({
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      select: {
        attempts: true,
        lastError: true,
        recipientName: true,
        reportDate: true,
        sentAt: true,
        status: true,
        totalCount: true,
      },
    }),
    db.baleLunchReportRecipient.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        active: true,
        chatId: true,
        name: true,
        userId: true,
        user: {
          select: { email: true, name: true },
        },
        _count: {
          select: { deliveries: true },
        },
      },
    }),
  ]);

  const counts = new Map(
    deliveryCounts.map((item) => [item.status, item._count._all]),
  );
  const connectedCount = users.filter(
    (user) => user.baleConnection?.enabled,
  ).length;
  const connectedUsers = users
    .filter((user) => user.active && user.baleConnection?.enabled)
    .map((user) => ({ email: user.email, id: user.id, name: user.name }));
  const failedCount = counts.get(BaleDeliveryStatus.FAILED) ?? 0;
  const activeLunchReportRecipientCount = lunchReportRecipients.filter(
    (recipient) => recipient.active,
  ).length;
  const health = getSyncHealth({
    configured: Boolean(
      process.env.BALE_BOT_TOKEN?.trim() && process.env.BALE_SYNC_SECRET?.trim(),
    ),
    failedDeliveries: failedCount,
    lastSyncFailedAt: botState?.lastSyncFailedAt ?? null,
    lastSyncSucceededAt: botState?.lastSyncSucceededAt ?? null,
  });
  const lunchReportStatus = latestLunchReport
    ? getLunchReportStatusPresentation(latestLunchReport.status)
    : null;

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="وضعیت اتصال کاربران، سلامت ارسال و مدیریت گیرنده‌های گزارش ناهار"
        title="پیام‌رسان بله"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <section className="grid gap-4 rounded-lg border bg-card p-5 text-card-foreground">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">سلامت ارسال</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              این وضعیت، اجرای زمان‌بندی‌شده و نتیجه واقعی تحویل پیام‌ها را بررسی می‌کند.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-sm font-medium ${health.className}`}>
            {health.label}
          </span>
        </div>

        <div className={`rounded-md border p-4 text-sm ${health.className}`}>
          {health.message}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">آخرین همگام‌سازی موفق</p>
            <p className="mt-2 text-sm font-medium text-slate-950">
              {botState?.lastSyncSucceededAt
                ? formatJalaliDateTime(botState.lastSyncSucceededAt)
                : "ثبت نشده"}
            </p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">آخرین ارسال موفق</p>
            <p className="mt-2 text-sm font-medium text-slate-950">
              {latestSuccess?.sentAt
                ? formatJalaliDateTime(latestSuccess.sentAt)
                : "ثبت نشده"}
            </p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">پیام‌های ارسال‌شده</p>
            <p className="mt-2 text-lg font-semibold text-emerald-700">
              {formatCount(counts.get(BaleDeliveryStatus.SENT) ?? 0)}
            </p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">پیام‌های ناموفق</p>
            <p className="mt-2 text-lg font-semibold text-red-700">
              {formatCount(failedCount)}
            </p>
          </div>
        </div>

        {latestFailure ? (
          <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">
                آخرین خطا برای {latestFailure.notification.user.name}، در {formatJalaliDateTime(latestFailure.updatedAt)}
              </p>
              <p className="mt-1 break-words text-xs leading-5 text-red-800">
                {latestFailure.lastError ?? "خطای نامشخص"} — تلاش {formatCount(latestFailure.attempts)} از ۳
              </p>
            </div>
          </div>
        ) : null}

        {botState?.lastSyncError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-medium">خطای آخرین اجرای ناموفق</p>
            <p className="mt-1 break-words text-xs leading-5">{botState.lastSyncError}</p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-5 text-card-foreground">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">گزارش ناهار</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              گزارش روزانه برای همه گیرنده‌های فعال ارسال می‌شود و وضعیت آن از اعلان‌های شخصی کاربران جدا است.
            </p>
          </div>
          {lunchReportStatus ? (
            <span
              className={`rounded-full border px-3 py-1 text-sm font-medium ${lunchReportStatus.className}`}
            >
              {lunchReportStatus.label}
            </span>
          ) : null}
        </div>

        {activeLunchReportRecipientCount === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            هنوز گیرنده فعالی برای گزارش ناهار تعریف نشده است، بنابراین گزارشی ارسال نمی‌شود.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">گیرنده‌های فعال</p>
            <p className="mt-2 text-sm font-medium text-slate-950">
              {formatCount(activeLunchReportRecipientCount)}
            </p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">آخرین تاریخ گزارش</p>
            <p className="mt-2 text-sm font-medium text-slate-950">
              {latestLunchReport
                ? formatJalaliDate(latestLunchReport.reportDate)
                : "ثبت نشده"}
            </p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">جمع کل snapshot</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">
              {latestLunchReport ? formatCount(latestLunchReport.totalCount) : "۰"}
            </p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">تعداد تلاش‌ها</p>
            <p className="mt-2 text-sm font-medium text-slate-950">
              {latestLunchReport ? formatCount(latestLunchReport.attempts) : "۰"}
            </p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">آخرین ارسال موفق</p>
            <p className="mt-2 text-sm font-medium text-slate-950">
              {latestLunchReport?.sentAt
                ? formatJalaliDateTime(latestLunchReport.sentAt)
                : "ثبت نشده"}
            </p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">آخرین بررسی scheduler</p>
            <p className="mt-2 text-sm font-medium text-slate-950">
              {botState?.lastLunchReportCheckAt
                ? formatJalaliDateTime(botState.lastLunchReportCheckAt)
                : "ثبت نشده"}
            </p>
          </div>
        </div>

        {latestLunchReport?.recipientName ? (
          <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
            آخرین وضعیت ثبت‌شده مربوط به گیرنده «{latestLunchReport.recipientName}» بوده است.
          </div>
        ) : null}

        {latestLunchReport?.lastError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-medium">آخرین خطای گزارش ناهار</p>
            <p className="mt-1 break-words text-xs leading-5">{latestLunchReport.lastError}</p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-5 text-card-foreground">
        <div>
          <h2 className="font-semibold text-slate-950">گیرنده‌های گزارش ناهار</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            مقصد می‌تواند یک گروه/گفت‌وگو یا یکی از کاربران متصل به بله باشد. غیرفعال‌سازی، ارسال‌های بعدی را متوقف می‌کند و سابقه باقی می‌ماند.
          </p>
        </div>

        <form
          action={createBaleLunchReportRecipientAction}
          className="grid gap-3 rounded-md border bg-background p-4 lg:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <BaleLunchReportRecipientFields connectedUsers={connectedUsers} />
          <SubmitButton className="lg:self-end" pendingLabel="در حال افزودن">
            <Save className="h-4 w-4" />
            افزودن گیرنده
          </SubmitButton>
        </form>

        <div className="grid gap-3">
          {lunchReportRecipients.length === 0 ? (
            <div className="rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
              هنوز گیرنده‌ای ثبت نشده است.
            </div>
          ) : (
            lunchReportRecipients.map((recipient) => (
              <form
                action={updateBaleLunchReportRecipientAction}
                className="grid gap-3 rounded-md border bg-background p-4 lg:grid-cols-[1fr_1fr_1fr_auto_auto_auto]"
                key={recipient.id}
              >
                <input name="recipientId" type="hidden" value={recipient.id} />
                <BaleLunchReportRecipientFields
                  chatId={recipient.chatId}
                  connectedUsers={
                    recipient.userId &&
                    !connectedUsers.some((user) => user.id === recipient.userId) &&
                    recipient.user
                      ? [
                          ...connectedUsers,
                          {
                            email: recipient.user.email,
                            id: recipient.userId,
                            name: `${recipient.user.name} (اتصال غیرفعال)`,
                          },
                        ]
                      : connectedUsers
                  }
                  name={recipient.name}
                  userId={recipient.userId}
                />
                <label className="flex h-10 items-center gap-2 text-sm lg:self-end">
                  <input
                    defaultChecked={recipient.active}
                    name="active"
                    type="checkbox"
                  />
                  فعال
                </label>
                <div className="text-xs text-muted-foreground lg:self-end lg:pb-2">
                  {formatCount(recipient._count.deliveries)} delivery
                </div>
                <SubmitButton className="lg:self-end" pendingLabel="در حال ذخیره" variant="outline">
                  <Save className="h-4 w-4" />
                  ذخیره
                </SubmitButton>
              </form>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-5 text-card-foreground">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">اتصال کاربران</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              اتصال از صفحه تنظیمات بله توسط خود کاربر انجام می‌شود.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatCount(connectedCount)} متصل از {formatCount(users.length)} کاربر
          </p>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3 text-right font-medium">کاربر</th>
                <th className="px-4 py-3 text-right font-medium">وضعیت حساب</th>
                <th className="px-4 py-3 text-right font-medium">اتصال بله</th>
                <th className="px-4 py-3 text-right font-medium">زمان اتصال</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => {
                const connected = Boolean(user.baleConnection?.enabled);

                return (
                  <tr className="bg-background" key={user.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">{user.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={user.active ? "text-emerald-700" : "text-slate-500"}>
                        {user.active ? "فعال" : "غیرفعال"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 ${connected ? "text-emerald-700" : "text-slate-500"}`}>
                        {connected ? <CheckCircle2 className="h-4 w-4" /> : <CircleSlash2 className="h-4 w-4" />}
                        {connected ? "متصل" : "متصل نشده"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.baleConnection?.linkedAt
                        ? formatJalaliDateTime(user.baleConnection.linkedAt)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
