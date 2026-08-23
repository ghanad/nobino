import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import {
  formatDeskReportRangeForCaption,
  getDeskPeopleReport,
  type DeskPeopleReport,
  type DeskPeopleReportPeriod,
} from "@/lib/desk-people-report-service";
import { cn } from "@/lib/utils";

type DeskReportPageProps = {
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

function buildReportHref(period: DeskPeopleReportPeriod, dateParam: string) {
  return `/manager/desk-report?period=${period}&date=${encodeURIComponent(dateParam)}`;
}

function PeriodToggle({
  activePeriod,
  dateParam,
}: {
  activePeriod: DeskPeopleReportPeriod;
  dateParam: string;
}) {
  const items: Array<{ label: string; period: DeskPeopleReportPeriod }> = [
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

function PeopleTable({ report }: { report: DeskPeopleReport }) {
  if (report.people.length === 0) {
    return (
      <section className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
        در این بازه رزرو تاییدشده‌ای برای میزهای کاری وجود ندارد.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-5 py-4">
        <h2 className="font-medium text-slate-950">جزئیات افراد</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          ساعت رزرو تاییدشده میزها بر اساس {formatDeskReportRangeForCaption(report)}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-right font-medium">نام</th>
              <th className="px-4 py-3 text-right font-medium">ساعت تاییدشده</th>
              <th className="px-4 py-3 text-right font-medium">تعداد رزرو</th>
              <th className="px-4 py-3 text-right font-medium">تعداد روز</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.people.map((person) => (
              <tr className="bg-background" key={person.name}>
                <td className="px-4 py-3 font-medium text-slate-950">{person.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatPersianNumber(person.approvedHours)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatPersianNumber(person.reservationCount)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatPersianNumber(person.distinctDays)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function DeskReportPage({
  searchParams,
}: DeskReportPageProps) {
  await requireRole([UserRole.MANAGER, UserRole.ADMIN]);
  const params = await searchParams;
  const report = await getDeskPeopleReport({
    date: params?.date,
    period: params?.period,
  });

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="مصرف میزهای کاری به تفکیک افراد، فقط بر پایه رزروهای تاییدشده"
        title="گزارش میزها"
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
          hint="کل واقعی رزروهای تاییدشده میزها در این بازه"
          title="ساعت تاییدشده"
          value={`${formatPersianNumber(report.totalApprovedHours)} ساعت`}
        />
        <SummaryCard
          hint="فقط وضعیت APPROVED شمرده شده است"
          title="تعداد رزرو تاییدشده"
          value={formatPersianNumber(report.totalApprovedReservationCount)}
        />
        <SummaryCard
          hint="افرادی که حداقل یک رزرو تاییدشده دارند"
          title="تعداد افراد فعال"
          value={formatPersianNumber(report.activePeopleCount)}
        />
      </section>

      <PeopleTable report={report} />
    </div>
  );
}
