import { BaleDeliveryStatus, UserRole } from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash2,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDateTime } from "@/lib/jalali-date";

const SYNC_STALE_AFTER_MS = 5 * 60 * 1000;
const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

function formatCount(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
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

export default async function AdminBalePage() {
  await requireRole([UserRole.ADMIN]);

  const [
    users,
    botState,
    deliveryCounts,
    latestFailure,
    latestSuccess,
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
  ]);

  const counts = new Map(
    deliveryCounts.map((item) => [item.status, item._count._all]),
  );
  const connectedCount = users.filter(
    (user) => user.baleConnection?.enabled,
  ).length;
  const failedCount = counts.get(BaleDeliveryStatus.FAILED) ?? 0;
  const health = getSyncHealth({
    configured: Boolean(
      process.env.BALE_BOT_TOKEN?.trim() && process.env.BALE_SYNC_SECRET?.trim(),
    ),
    failedDeliveries: failedCount,
    lastSyncFailedAt: botState?.lastSyncFailedAt ?? null,
    lastSyncSucceededAt: botState?.lastSyncSucceededAt ?? null,
  });
  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="وضعیت اتصال کاربران و سلامت ارسال اعلان‌های بله"
        title="پیام‌رسان بله"
      />

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
