import { LunchReservationStatus } from "@prisma/client";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateWithoutWeekday,
  formatJalaliDateParam,
  JALALI_DATE_INPUT_PLACEHOLDER,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import { canAccessLunchReport } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type LunchReportPageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

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

function addDays(date: Date, days: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    0,
    0,
    0,
    0,
  );
}

function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

function getReportHref(date: Date): string {
  return `/lunch/report?date=${formatJalaliDateParam(date)}`;
}

function getJalaliWeekday(date: Date): string {
  return formatJalaliDate(date).split(" ").slice(0, 2).join(" ");
}

export default async function LunchReportPage({
  searchParams,
}: LunchReportPageProps) {
  const user = await requireCurrentUser();

  if (!canAccessLunchReport(user)) {
    redirect("/lunch");
  }

  const params = await searchParams;
  const reportDate = parseJalaliDateParam(params?.date) ?? new Date();
  const reportDay = startOfLocalDay(reportDate);
  const today = startOfLocalDay(new Date());
  const [locations, reportReservations] = await Promise.all([
    db.lunchLocation.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.lunchReservation.findMany({
      where: {
        date: reportDay,
        status: LunchReservationStatus.ACTIVE,
      },
      orderBy: [{ location: { name: "asc" } }, { user: { name: "asc" } }],
      select: {
        id: true,
        locationId: true,
        user: { select: { name: true } },
      },
    }),
  ]);
  const reportDateParam = formatJalaliDateParam(reportDay);
  const quickDays = Array.from({ length: 7 }, (_, index) =>
    addDays(reportDay, index - 3),
  );
  const groupedReport = reportReservations.reduce(
    (groups, reservation) => {
      const key = reservation.locationId;
      const current = groups.get(key) ?? [];
      current.push(reservation);
      groups.set(key, current);

      return groups;
    },
    new Map<string, typeof reportReservations>(),
  );
  const reportLocations = locations.map((location) => ({
    ...location,
    reservations: groupedReport.get(location.id) ?? [],
  }));

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="لیست روزانه رزروهای فعال ناهار بر اساس ساختمان"
        title="گزارش روزانه ناهار"
      />

      <section className="grid gap-4 rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-medium">گزارش روزانه</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatJalaliDate(reportDay)}، {reportReservations.length} رزرو فعال
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <form className="flex gap-2" method="get">
              <InputText
                defaultValue={reportDateParam}
                name="date"
                placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
              />
              <Button type="submit" variant="outline">
                نمایش
              </Button>
            </form>
            <Button asChild variant="outline">
              <Link href={`/lunch/report/export?date=${reportDateParam}`}>
                <Download className="h-4 w-4" />
                CSV
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 rounded-md border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href={getReportHref(addDays(reportDay, -1))}>
                <ChevronRight className="h-4 w-4" />
                روز قبل
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={getReportHref(today)}>امروز</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={getReportHref(addDays(reportDay, 1))}>
                روز بعد
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {quickDays.map((date) => {
              const dateParam = formatJalaliDateParam(date);
              const isSelected = dateParam === reportDateParam;
              const isToday = date.getTime() === today.getTime();

              return (
                <Link
                  aria-current={isSelected ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md border px-3 py-2 text-center text-sm transition-colors",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-muted/20 text-slate-700 hover:bg-accent hover:text-accent-foreground",
                  )}
                  href={getReportHref(date)}
                  key={dateParam}
                >
                  <span className="font-medium">
                    {isToday ? "امروز" : getJalaliWeekday(date)}
                  </span>
                  <span className="text-xs">
                    {formatJalaliDateWithoutWeekday(date)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {locations.length === 0 ? (
          <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
            هنوز ساختمان فعالی برای گزارش ناهار تعریف نشده است.
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {reportLocations.map((location) => (
                <div
                  className="rounded-md border bg-background p-4"
                  key={location.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium">{location.name}</h3>
                    <span className="text-2xl font-semibold text-primary">
                      {location.reservations.length}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {reportReservations.length === 0 ? (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                برای این تاریخ رزرو ناهار ثبت نشده است.
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border bg-background">
                <div className="grid grid-cols-[1fr_1fr] border-b bg-muted/30 px-4 py-3 text-sm font-medium text-muted-foreground">
                  <span>نام</span>
                  <span>ساختمان</span>
                </div>
                <div className="divide-y">
                  {reportLocations.flatMap((location) =>
                    location.reservations.map((reservation) => (
                      <div
                        className="grid grid-cols-[1fr_1fr] px-4 py-3 text-sm"
                        key={reservation.id}
                      >
                        <span>{reservation.user.name}</span>
                        <span className="text-muted-foreground">
                          {location.name}
                        </span>
                      </div>
                    )),
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
