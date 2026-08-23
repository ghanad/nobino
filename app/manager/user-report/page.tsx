import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import {
  formatUserReportRangeForCaption,
  getUserReservationReport,
  type UserReservationReport,
  type UserReservationReportPeriod,
} from "@/lib/user-reservation-report-service";
import { cn } from "@/lib/utils";

type UserReportPageProps = {
  searchParams?: Promise<{
    date?: string;
    period?: string;
  }>;
};

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR", {
  maximumFractionDigits: 1,
});

function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

function buildReportHref(period: UserReservationReportPeriod, dateParam: string) {
  return `/manager/user-report?period=${period}&date=${encodeURIComponent(dateParam)}`;
}

function PeriodToggle({
  activePeriod,
  dateParam,
}: {
  activePeriod: UserReservationReportPeriod;
  dateParam: string;
}) {
  const items: Array<{ label: string; period: UserReservationReportPeriod }> = [
    { label: "هفتگی", period: "week" },
    { label: "ماهانه", period: "month" },
  ];

  return (
    <div className="inline-flex rounded-lg border bg-muted/20 p-1">
      {items.map((item) => {
        const isActive = item.period === activePeriod;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
              isActive
                ? "bg-card text-slate-950 shadow-sm"
                : "text-muted-foreground hover:text-slate-950",
            )}
            href={buildReportHref(item.period, dateParam)}
            key={item.period}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function SummaryCard({
  hint,
  title,
  value,
}: {
  hint: string;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

function UserUsageChart({ report }: { report: UserReservationReport }) {
  const maxHours = Math.max(...report.users.map((user) => user.approvedHours), 0);

  if (report.users.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
        در این بازه رزرو تاییدشده‌ای ثبت نشده است.
      </div>
    );
  }

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-slate-950">مقایسه کاربران</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            نمودار بر اساس ساعت رزرو تاییدشده در {formatUserReportRangeForCaption(report)}
          </p>
        </div>
      </div>
      <div className="grid gap-y-1.5">
        {report.users.map((user) => {
          const percentage = maxHours > 0 ? (user.approvedHours / maxHours) * 100 : 0;

          return (
            <div className="flex items-center gap-3" key={user.id}>
              <span
                className="w-24 shrink-0 truncate text-sm font-medium text-slate-900 sm:w-32"
                title={user.name}
              >
                {user.name}
              </span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600 transition-[width]"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-left text-xs tabular-nums text-muted-foreground">
                {formatPersianNumber(user.approvedHours)} ساعت
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function UserReportPage({
  searchParams,
}: UserReportPageProps) {
  await requireRole([UserRole.MANAGER, UserRole.ADMIN]);
  const params = await searchParams;
  const report = await getUserReservationReport({
    date: params?.date,
    period: params?.period,
  });

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="گزارش مصرف سیستم‌ها به تفکیک کاربران، فقط بر پایه رزروهای تاییدشده"
        title="گزارش کاربران"
      />

      <section className="grid gap-4 rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-medium text-slate-950">
              بازه {report.period === "week" ? "هفتگی" : "ماهانه"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{report.rangeLabel}</p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <PeriodToggle
              activePeriod={report.period}
              dateParam={report.dateParam}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button asChild className="w-full min-w-0" variant="outline">
            <Link href={buildReportHref(report.period, report.previousDateParam)}>
              <ChevronRight className="h-4 w-4" />
              بازه قبل
            </Link>
          </Button>
          <Button asChild className="w-full min-w-0" variant="outline">
            <Link href={buildReportHref(report.period, report.todayDateParam)}>
              امروز
            </Link>
          </Button>
          <Button asChild className="w-full min-w-0" variant="outline">
            <Link href={buildReportHref(report.period, report.nextDateParam)}>
              بازه بعد
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          hint="کل واقعی رزروهای تاییدشده در این بازه"
          title="ساعت تاییدشده"
          value={`${formatPersianNumber(report.totalApprovedHours)} ساعت`}
        />
        <SummaryCard
          hint="فقط وضعیت APPROVED شمرده شده است"
          title="تعداد رزرو تاییدشده"
          value={formatPersianNumber(report.totalApprovedReservationCount)}
        />
        <SummaryCard
          hint="کاربرانی که حداقل یک رزرو تاییدشده دارند"
          title="کاربران رزروکننده"
          value={formatPersianNumber(report.totalReservingUsers)}
        />
      </section>

      <UserUsageChart report={report} />

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-medium text-slate-950">جزئیات کاربران</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            تیم‌ها بر اساس عضویت‌های فعلی کاربر نمایش داده شده‌اند.
          </p>
        </div>

        {report.users.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">
            داده‌ای برای نمایش وجود ندارد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">نام</th>
                  <th className="px-4 py-3 text-right font-medium">تیم‌ها</th>
                  <th className="px-4 py-3 text-right font-medium">ساعت تاییدشده</th>
                  <th className="px-4 py-3 text-right font-medium">تعداد رزرو</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.users.map((user) => (
                  <tr className="bg-background" key={user.id}>
                    <td className="px-4 py-3 font-medium text-slate-950">{user.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.teamNames.join("، ")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatPersianNumber(user.approvedHours)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatPersianNumber(user.reservationCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
