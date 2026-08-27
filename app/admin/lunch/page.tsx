import { UserRole } from "@prisma/client";
import { MessageSquareText, Plus, Save, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";

import {
  createLunchExceptionAction,
  deleteLunchExceptionAction,
  updateLunchExceptionAction,
  updateLunchSettingsAction,
} from "@/app/admin/lunch/actions";
import { LunchWeeklyScheduleForm } from "@/app/admin/lunch/lunch-weekly-schedule-form";
import { AdminLunchReportSettings } from "@/app/admin/lunch-notifications/page";
import { PageHeader } from "@/components/app/page-header";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDate } from "@/lib/jalali-date";

type AdminLunchPageProps = {
  searchParams?: Promise<{
    error?: string;
    exceptionCreated?: string;
    exceptionDeleted?: string;
    exceptionUpdated?: string;
    settingsUpdated?: string;
    view?: string;
    manualFailed?: string;
    manualSent?: string;
    recipientCreated?: string;
    recipientDeleted?: string;
    recipientUpdated?: string;
    reportSettingsUpdated?: string;
  }>;
};

type LunchAdminView = "settings" | "reports";

function parseLunchAdminView(value?: string): LunchAdminView {
  return value === "reports" ? "reports" : "settings";
}

function LunchAdminRail({ activeView }: { activeView: LunchAdminView }) {
  const items = [
    {
      icon: Settings2,
      label: "تنظیمات رزرو",
      value: "settings" as const,
    },
    {
      icon: MessageSquareText,
      label: "گزارش و ارسال",
      value: "reports" as const,
    },
  ];

  return (
    <aside className="flex flex-col rounded-lg border bg-muted/20 p-3 sm:p-5 lg:sticky lg:top-8">
      <nav aria-label="بخش‌های مدیریت غذا">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:grid-cols-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.value === activeView;
            const href =
              item.value === "settings"
                ? "/admin/lunch"
                : "/admin/lunch?view=reports";

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-center text-xs font-medium transition-colors lg:min-h-12 lg:justify-start lg:px-4 lg:text-sm ${
                  isActive
                    ? "border-border bg-card text-slate-950 shadow-sm"
                    : "border-transparent text-slate-600 hover:bg-card/60 hover:text-slate-950"
                }`}
                href={href}
                key={item.value}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function getAdminLunchToast(params: Awaited<AdminLunchPageProps["searchParams"]>) {
  if (params?.error) {
    return {
      consumeKeys: ["error"],
      message: params.error,
      variant: "error" as const,
    };
  }

  const successKeys = [
    "settingsUpdated",
    "exceptionCreated",
    "exceptionUpdated",
    "exceptionDeleted",
  ];
  const successKey = successKeys.find((key) => params?.[key as keyof typeof params]);

  if (successKey) {
    return {
      consumeKeys: [successKey],
      message: "تغییرات ذخیره شد.",
      variant: "success" as const,
    };
  }

  return null;
}

function InputText({
  defaultValue,
  name,
  placeholder,
}: {
  defaultValue?: string | number;
  name: string;
  placeholder?: string;
}) {
  return (
    <input
      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      defaultValue={defaultValue}
      name={name}
      placeholder={placeholder}
      type="text"
    />
  );
}

export default async function AdminLunchPage({
  searchParams,
}: AdminLunchPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const activeView = parseLunchAdminView(params?.view);
  const toast = getAdminLunchToast(params);

  if (activeView === "reports") {
    return (
      <div className="grid gap-6" dir="rtl">
        <PageHeader
          subtitle="تنظیمات رزرو، گزارش روزانه و گیرنده‌های ارسال غذا در یک صفحه"
          title="مدیریت غذا"
        />
        <div className="grid items-start gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
          <LunchAdminRail activeView={activeView} />
          <main className="min-w-0">
            <AdminLunchReportSettings
              searchParams={Promise.resolve(params ?? {})}
              showHeader={false}
            />
          </main>
        </div>
      </div>
    );
  }
  const [
    settings,
    weeklySchedule,
    exceptions,
  ] = await Promise.all([
    db.lunchSettings.findUnique({ where: { id: "default" } }),
    db.lunchWeeklySchedule.findMany({
      orderBy: { dayOfWeek: "asc" },
      select: { id: true, dayOfWeek: true, isServiceDay: true },
    }),
    db.lunchException.findMany({
      orderBy: { date: "desc" },
      take: 20,
      select: {
        id: true,
        date: true,
        isServiceDay: true,
        reason: true,
      },
    }),
  ]);

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="تنظیمات رزرو، گزارش روزانه و گیرنده‌های ارسال غذا در یک صفحه"
        title="مدیریت غذا"
      />

      {toast ? <UrlToast {...toast} /> : null}
      <div className="grid items-start gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
        <LunchAdminRail activeView={activeView} />
        <main className="grid min-w-0 gap-6">
      <section className="grid gap-4 rounded-lg border bg-card p-5">
        <div>
          <h2 className="font-medium">تنظیمات کلی</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            مهلت رزرو و لغو یکسان است و نسبت به روز قبل محاسبه می‌شود.
          </p>
        </div>
        <form
          action={updateLunchSettingsAction}
          className="grid gap-4 md:grid-cols-[auto_auto_auto_auto] md:items-end"
        >
          <label className="grid gap-2 text-sm">
            <span>حداکثر روزهای آینده</span>
            <input
              className="h-10 rounded-md border border-input bg-background px-3"
              defaultValue={settings?.maxAdvanceDays ?? 7}
              max={31}
              min={1}
              name="maxAdvanceDays"
              type="number"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>مهلت روز قبل</span>
            <input
              className="h-10 rounded-md border border-input bg-background px-3"
              defaultValue={settings?.cutoffTime ?? "23:59"}
              name="cutoffTime"
              placeholder="23:59"
              type="text"
            />
          </label>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              defaultChecked={settings?.enabled ?? true}
              name="enabled"
              type="checkbox"
            />
            رزرو غذا فعال باشد
          </label>
          <SubmitButton pendingLabel="در حال ذخیره">
            <Save className="h-4 w-4" />
            ذخیره
          </SubmitButton>
        </form>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-5">
        <div>
          <h2 className="font-medium">ساختمان‌ها</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ساختمان‌ها منبع مشترک رزرو میز، سیستم و غذا هستند و فقط از بخش مدیریت مرکزی تغییر می‌کنند.
          </p>
        </div>
        <Link className="w-fit text-sm font-medium text-primary hover:underline" href="/admin/buildings">
          رفتن به مدیریت مرکزی ساختمان‌ها
        </Link>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-5">
        <h2 className="font-medium">برنامه هفتگی غذا</h2>
        <LunchWeeklyScheduleForm days={weeklySchedule} />
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-5">
        <div>
          <h2 className="font-medium">استثناهای غذا</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            برای تعطیلی یا فعال‌سازی یک تاریخ خاص، تاریخ شمسی وارد کنید.
          </p>
        </div>
        <form
          action={createLunchExceptionAction}
          className="grid gap-3 md:grid-cols-[auto_auto_1fr_auto]"
        >
          <JalaliDatePicker name="date" required />
          <label className="flex h-10 items-center gap-2 text-sm">
            <input name="isServiceDay" type="checkbox" />
            سرویس فعال
          </label>
          <InputText name="reason" placeholder="توضیح" />
          <SubmitButton pendingLabel="در حال افزودن">
            <Plus className="h-4 w-4" />
            افزودن
          </SubmitButton>
        </form>
        <div className="grid gap-3">
          {exceptions.map((exception) => (
            <div
              className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-[auto_1fr_auto_auto]"
              key={exception.id}
            >
              <span className="self-center text-sm font-medium">
                {formatJalaliDate(exception.date)}
              </span>
              <form
                action={updateLunchExceptionAction}
                className="grid gap-3 md:grid-cols-[auto_1fr_auto]"
              >
                <input name="exceptionId" type="hidden" value={exception.id} />
                <label className="flex h-10 items-center gap-2 text-sm">
                  <input
                    defaultChecked={exception.isServiceDay}
                    name="isServiceDay"
                    type="checkbox"
                  />
                  سرویس فعال
                </label>
                <InputText
                  defaultValue={exception.reason ?? ""}
                  name="reason"
                  placeholder="توضیح"
                />
                <SubmitButton pendingLabel="در حال ذخیره" variant="outline">
                  ذخیره
                </SubmitButton>
              </form>
              <form action={deleteLunchExceptionAction}>
                <input name="exceptionId" type="hidden" value={exception.id} />
                <SubmitButton pendingLabel="در حال حذف" variant="outline">
                  <Trash2 className="h-4 w-4" />
                  حذف
                </SubmitButton>
              </form>
            </div>
          ))}
        </div>
      </section>
        </main>
      </div>
    </div>
  );
}
