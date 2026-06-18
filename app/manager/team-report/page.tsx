import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import {
  formatTeamReportRangeForCaption,
  getTeamReservationReport,
  type TeamReservationReport,
  type TeamReservationReportPeriod,
} from "@/lib/team-reservation-report-service";
import { cn } from "@/lib/utils";

type TeamReportPageProps = {
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

function buildReportHref(period: TeamReservationReportPeriod, dateParam: string) {
  return `/manager/team-report?period=${period}&date=${encodeURIComponent(dateParam)}`;
}

function PeriodToggle({
  activePeriod,
  dateParam,
}: {
  activePeriod: TeamReservationReportPeriod;
  dateParam: string;
}) {
  const items: Array<{ label: string; period: TeamReservationReportPeriod }> = [
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

function TeamUsageChart({ report }: { report: TeamReservationReport }) {
  const maxHours = Math.max(...report.teams.map((team) => team.approvedHours), 0);

  if (report.teams.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
        هنوز تیمی تعریف نشده است و مصرف بدون تیمی هم در این بازه وجود ندارد.
      </div>
    );
  }

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-slate-950">مقایسه تیم‌ها</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            نمودار بر اساس ساعت رزرو تاییدشده در {formatTeamReportRangeForCaption(report)}
          </p>
        </div>
      </div>
      <div className="grid gap-3">
        {report.teams.map((team) => {
          const percentage = maxHours > 0 ? (team.approvedHours / maxHours) * 100 : 0;

          return (
            <div className="grid gap-2" key={team.name}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-900">{team.name}</span>
                <span className="text-muted-foreground">
                  {formatPersianNumber(team.approvedHours)} ساعت
                </span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600 transition-[width]"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function TeamReportPage({
  searchParams,
}: TeamReportPageProps) {
  await requireRole([UserRole.MANAGER, UserRole.ADMIN]);
  const params = await searchParams;
  const report = await getTeamReservationReport({
    date: params?.date,
    period: params?.period,
  });

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="گزارش مصرف تیم‌ها فقط بر پایه رزروهای تاییدشده"
        title="گزارش تیم‌ها"
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          hint="کل واقعی رزروهای تاییدشده در این بازه"
          title="ساعت تاییدشده واقعی"
          value={`${formatPersianNumber(report.totalApprovedHours)} ساعت`}
        />
        <SummaryCard
          hint="در عضویت چندتیمی ممکن است از کل واقعی بیشتر شود"
          title="ساعت نسبت‌داده‌شده"
          value={`${formatPersianNumber(report.totalAttributedHours)} ساعت`}
        />
        <SummaryCard
          hint="فقط وضعیت APPROVED شمرده شده است"
          title="تعداد رزرو تاییدشده"
          value={formatPersianNumber(report.totalApprovedReservationCount)}
        />
        <SummaryCard
          hint="کاربران یکتای رزروکننده در این بازه"
          title="تعداد کاربران رزروکننده"
          value={formatPersianNumber(report.totalReservingUsers)}
        />
      </section>

      <TeamUsageChart report={report} />

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-medium text-slate-950">جزئیات تیم‌ها</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            عضویت‌ها بر اساس تیم‌های فعلی کاربر محاسبه شده‌اند.
          </p>
        </div>

        {report.teams.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">
            داده‌ای برای نمایش وجود ندارد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">نام تیم</th>
                  <th className="px-4 py-3 text-right font-medium">ساعت تاییدشده</th>
                  <th className="px-4 py-3 text-right font-medium">تعداد رزرو</th>
                  <th className="px-4 py-3 text-right font-medium">کاربران رزروکننده</th>
                  <th className="px-4 py-3 text-right font-medium">تعداد اعضا</th>
                  <th className="px-4 py-3 text-right font-medium">میانگین ساعت به ازای عضو</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.teams.map((team) => (
                  <tr className="bg-background" key={team.name}>
                    <td className="px-4 py-3 font-medium text-slate-950">{team.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatPersianNumber(team.approvedHours)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatPersianNumber(team.reservationCount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatPersianNumber(team.reservingUserCount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatPersianNumber(team.memberCount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatPersianNumber(team.averageHoursPerMember)}
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
