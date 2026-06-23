import { BaleDeliveryStatus, UserRole } from "@prisma/client";
import { MessageSquareText, Plus, Save, Send, Trash2, Users } from "lucide-react";

import {
  createBaleLunchReportRecipientAction,
  deleteBaleLunchReportRecipientAction,
  sendBaleLunchReportNowAction,
  updateBaleLunchReportRecipientAction,
} from "@/app/admin/lunch-notifications/actions";
import { BaleLunchReportRecipientFields } from "@/app/admin/bale/recipient-form-fields";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { getBaleBotUsername } from "@/lib/bale-client";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDate, formatJalaliDateTime } from "@/lib/jalali-date";
import { addDays, startOfLocalDay } from "@/lib/lunch-service";

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

function getToast(params: {
  error?: string;
  manualFailed?: string;
  manualSent?: string;
  recipientCreated?: string;
  recipientDeleted?: string;
  recipientUpdated?: string;
}) {
  if (params.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  if (params.manualFailed) {
    return {
      consumeKeys: ["manualFailed", "manualSent"],
      message: `گزارش برای ${formatCount(Number(params.manualSent ?? 0))} گیرنده ارسال شد و ارسال به ${formatCount(Number(params.manualFailed))} گیرنده ناموفق بود.`,
      variant: "error" as const,
    };
  }

  if (params.manualSent) {
    return {
      consumeKeys: ["manualSent"],
      message: `گزارش ناهار همین حالا برای ${formatCount(Number(params.manualSent))} گیرنده ارسال شد.`,
      variant: "success" as const,
    };
  }

  if (params.recipientCreated || params.recipientUpdated) {
    return {
      consumeKeys: [params.recipientCreated ? "recipientCreated" : "recipientUpdated"],
      message: "تغییرات گیرنده گزارش ناهار ذخیره شد.",
      variant: "success" as const,
    };
  }

  if (params.recipientDeleted) {
    return {
      consumeKeys: ["recipientDeleted"],
      message: "گیرنده گزارش ناهار حذف شد.",
      variant: "success" as const,
    };
  }

  return null;
}

export default async function AdminLunchNotificationsPage(props: {
  searchParams?: Promise<{
    error?: string;
    manualFailed?: string;
    manualSent?: string;
    recipientCreated?: string;
    recipientDeleted?: string;
    recipientUpdated?: string;
  }>;
}) {
  await requireRole([UserRole.ADMIN]);
  const params = (await props.searchParams) ?? {};
  const toast = getToast(params);
  const baleBotUsername = getBaleBotUsername();

  const [users, botState, latestLunchReport, lunchReportRecipients] =
    await Promise.all([
      db.user.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          baleConnection: { select: { enabled: true } },
        },
      }),
      db.baleBotState.findUnique({ where: { id: "default" } }),
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
          user: { select: { email: true, name: true } },
          _count: { select: { deliveries: true } },
        },
      }),
    ]);

  const connectedUsers = users
    .filter((user) => user.baleConnection?.enabled)
    .map((user) => ({ email: user.email, id: user.id, name: user.name }));
  const activeRecipientCount = lunchReportRecipients.filter(
    (recipient) => recipient.active,
  ).length;
  const reportStatus = latestLunchReport
    ? getLunchReportStatusPresentation(latestLunchReport.status)
    : null;
  const nextReportDate = addDays(startOfLocalDay(new Date()), 1);

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="وضعیت ارسال روزانه و مدیریت گیرنده‌های گزارش ناهار"
        title="ارسال گزارش ناهار"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <section className="grid gap-4 rounded-lg border bg-card p-5 text-card-foreground">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">وضعیت ارسال</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              گزارش روزانه برای همه گیرنده‌های فعال ارسال می‌شود و از اعلان‌های شخصی کاربران جدا است.
            </p>
          </div>
          {reportStatus ? (
            <span className={`rounded-full border px-3 py-1 text-sm font-medium ${reportStatus.className}`}>
              {reportStatus.label}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 p-4">
          <div className="text-sm text-blue-950">
            <p className="font-medium">ارسال فوری گزارش {formatJalaliDate(nextReportDate)}</p>
            <p className="mt-1 text-xs leading-5 text-blue-800">
              گزارش فعلی برای همه گیرنده‌های فعال ارسال می‌شود. ارسال روزانه زمان‌بندی‌شده نیز در زمان خودش جداگانه انجام خواهد شد.
            </p>
          </div>
          <form action={sendBaleLunchReportNowAction}>
            <SubmitButton disabled={activeRecipientCount === 0} pendingLabel="در حال ارسال">
              <Send className="h-4 w-4" />
              همین حالا ارسال شود
            </SubmitButton>
          </form>
        </div>

        {activeRecipientCount === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            هنوز گیرنده فعالی برای گزارش ناهار تعریف نشده است، بنابراین گزارشی ارسال نمی‌شود.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">گیرنده‌های فعال</p>
            <p className="mt-2 text-sm font-medium text-slate-950">{formatCount(activeRecipientCount)}</p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">آخرین تاریخ گزارش</p>
            <p className="mt-2 text-sm font-medium text-slate-950">
              {latestLunchReport ? formatJalaliDate(latestLunchReport.reportDate) : "ثبت نشده"}
            </p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">جمع کل گزارش</p>
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
              {latestLunchReport?.sentAt ? formatJalaliDateTime(latestLunchReport.sentAt) : "ثبت نشده"}
            </p>
          </div>
          <div className="rounded-md border bg-background p-4">
            <p className="text-xs text-muted-foreground">آخرین بررسی زمان‌بند</p>
            <p className="mt-2 text-sm font-medium text-slate-950">
              {botState?.lastLunchReportCheckAt ? formatJalaliDateTime(botState.lastLunchReportCheckAt) : "ثبت نشده"}
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
            مقصد می‌تواند یک گروه یا گفت‌وگو، یا یکی از کاربران متصل به بله باشد.
          </p>
        </div>

        <form action={createBaleLunchReportRecipientAction} className="overflow-hidden rounded-lg border bg-muted/20">
          <div className="flex items-start gap-3 border-b bg-background px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Plus className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-950">گیرنده جدید</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                مشخصات مقصد دریافت گزارش روزانه را وارد کنید.
              </p>
            </div>
          </div>
          <div className="p-4">
            <BaleLunchReportRecipientFields
              baleBotUsername={baleBotUsername}
              connectedUsers={connectedUsers}
            />
          </div>
          <div className="flex justify-end border-t bg-background px-4 py-3">
            <SubmitButton pendingLabel="در حال افزودن">
              <Save className="h-4 w-4" />
              افزودن گیرنده
            </SubmitButton>
          </div>
        </form>

        <div className="grid gap-3">
          {lunchReportRecipients.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed bg-muted/10 px-4 py-8 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Users className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-medium text-foreground">هنوز گیرنده‌ای ثبت نشده است</p>
              <p className="mt-1 text-xs text-muted-foreground">
                با فرم بالا اولین مقصد گزارش روزانه را اضافه کنید.
              </p>
            </div>
          ) : (
            lunchReportRecipients.map((recipient) => (
              <form action={updateBaleLunchReportRecipientAction} className="overflow-hidden rounded-lg border bg-background" key={recipient.id}>
                <input name="recipientId" type="hidden" value={recipient.id} />
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-950">
                    <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                    {recipient.name}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatCount(recipient._count.deliveries)} ارسال
                  </span>
                </div>
                <div className="p-4">
                  <BaleLunchReportRecipientFields
                    baleBotUsername={baleBotUsername}
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
                    showChatIdHelp={false}
                    userId={recipient.userId}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input className="h-4 w-4 accent-primary" defaultChecked={recipient.active} name="active" type="checkbox" />
                    گیرنده فعال باشد
                  </label>
                  <div className="flex items-center gap-2">
                    <SubmitButton
                      formAction={deleteBaleLunchReportRecipientAction}
                      className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                      pendingLabel="در حال حذف"
                      size="sm"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                      حذف
                    </SubmitButton>
                    <SubmitButton pendingLabel="در حال ذخیره" size="sm" variant="outline">
                      <Save className="h-4 w-4" />
                      ذخیره تغییرات
                    </SubmitButton>
                  </div>
                </div>
              </form>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
