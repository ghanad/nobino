import {
  AnnouncementAudience,
  AnnouncementSeverity,
  UserRole,
} from "@prisma/client";
import { Megaphone, Plus, Trash2 } from "lucide-react";

import {
  createAnnouncementAction,
  deactivateAnnouncementAction,
} from "@/app/admin/actions";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateParam,
} from "@/lib/jalali-date";

type AnnouncementsPageProps = {
  searchParams?: Promise<{
    announcementCreated?: string;
    announcementDeactivated?: string;
    error?: string;
  }>;
};

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  ADMIN: "ادمین‌ها",
  ALL: "همه کاربران",
  MANAGER: "مدیرها",
  USER: "کاربران عادی",
};

const SEVERITY_LABELS: Record<AnnouncementSeverity, string> = {
  IMPORTANT: "مهم",
  NORMAL: "معمولی",
};

function getToast(params: Awaited<AnnouncementsPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successMessage =
    (params?.announcementCreated && "اعلان عمومی ساخته شد.") ||
    (params?.announcementDeactivated && "اعلان عمومی غیرفعال شد.");

  if (!successMessage) {
    return null;
  }

  return {
    consumeKeys: ["announcementCreated", "announcementDeactivated"],
    message: successMessage,
    variant: "success" as const,
  };
}

function formatAnnouncementWindow(input: {
  startsAt: Date;
  endsAt: Date | null;
}) {
  if (!input.endsAt) {
    return `از ${formatJalaliDate(input.startsAt)}`;
  }

  const inclusiveEnd = new Date(
    input.endsAt.getFullYear(),
    input.endsAt.getMonth(),
    input.endsAt.getDate() - 1,
    0,
    0,
    0,
    0,
  );

  return `از ${formatJalaliDate(input.startsAt)} تا ${formatJalaliDate(
    inclusiveEnd,
  )}`;
}

export default async function AdminAnnouncementsPage({
  searchParams,
}: AnnouncementsPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getToast(params);
  const today = formatJalaliDateParam(new Date());
  const announcements = await db.announcement.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    take: 30,
    select: {
      id: true,
      title: true,
      body: true,
      severity: true,
      audience: true,
      startsAt: true,
      endsAt: true,
      requiresAck: true,
      active: true,
      createdAt: true,
      _count: {
        select: {
          receipts: true,
        },
      },
    },
  });

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="ساخت پیام‌های عمومی برای نمایش بعد از ورود کاربران"
        title="اعلان‌ها"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <section className="grid gap-5 rounded-lg border bg-card p-5 text-card-foreground">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-slate-950">ساخت اعلان جدید</h2>
        </div>

        <form action={createAnnouncementAction} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              عنوان
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={120}
                name="title"
                required
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              مخاطب
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                name="audience"
              >
                {Object.values(AnnouncementAudience).map((audience) => (
                  <option key={audience} value={audience}>
                    {AUDIENCE_LABELS[audience]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium">
            متن پیام
            <textarea
              className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm leading-7 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              maxLength={1200}
              name="body"
              required
            />
          </label>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="grid gap-2 text-sm font-medium">
              اهمیت
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                name="severity"
              >
                {Object.values(AnnouncementSeverity).map((severity) => (
                  <option key={severity} value={severity}>
                    {SEVERITY_LABELS[severity]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              شروع نمایش
              <JalaliDatePicker
                name="startsAt"
                required
                value={today}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              پایان نمایش
              <JalaliDatePicker
                name="endsAt"
              />
            </label>

            <label className="mt-7 inline-flex h-10 items-center gap-2 text-sm font-medium">
              <input className="h-4 w-4" name="requiresAck" type="checkbox" />
              نیازمند تأیید کاربر
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="submit">
              <Megaphone className="h-4 w-4" />
              ارسال اعلان
            </Button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-5 text-card-foreground">
        <div>
          <h2 className="font-semibold text-slate-950">اعلان‌های اخیر</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            غیرفعال‌سازی، نمایش اعلان را برای همه کاربران متوقف می‌کند.
          </p>
        </div>

        {announcements.length === 0 ? (
          <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
            هنوز اعلانی ساخته نشده است.
          </div>
        ) : (
          <div className="grid gap-3">
            {announcements.map((announcement) => (
              <article
                className="rounded-lg border bg-background p-4"
                key={announcement.id}
              >
                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-slate-950">
                        {announcement.title}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {AUDIENCE_LABELS[announcement.audience]}
                      </span>
                      <span
                        className={
                          announcement.severity === "IMPORTANT"
                            ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
                            : "rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800"
                        }
                      >
                        {SEVERITY_LABELS[announcement.severity]}
                      </span>
                      <span
                        className={
                          announcement.active
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                        }
                      >
                        {announcement.active ? "فعال" : "غیرفعال"}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                      {announcement.body}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {formatAnnouncementWindow(announcement)} ·{" "}
                      {announcement.requiresAck ? "با تأیید کاربر" : "نمایش یک‌باره"} ·{" "}
                      {announcement._count.receipts.toLocaleString("fa-IR")} دریافت
                    </p>
                  </div>

                  {announcement.active ? (
                    <form action={deactivateAnnouncementAction}>
                      <input
                        name="announcementId"
                        type="hidden"
                        value={announcement.id}
                      />
                      <Button size="sm" type="submit" variant="outline">
                        <Trash2 className="h-4 w-4" />
                        غیرفعال‌سازی
                      </Button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
