"use client";

import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { cancelLunchReservationByManagerAction } from "@/app/lunch/report/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import type { LunchReportData } from "@/lib/lunch-report-service";
import { cn } from "@/lib/utils";

type LunchReportViewProps = {
  canCancelReservations: boolean;
  initialReport: LunchReportData;
};

function buildReportHref(dateParam: string): string {
  return `/lunch/report?date=${dateParam}`;
}

function buildDataHref(dateParam: string): string {
  return `/lunch/report/data?date=${encodeURIComponent(dateParam)}`;
}

export function LunchReportView({
  canCancelReservations,
  initialReport,
}: LunchReportViewProps) {
  const [dateInput, setDateInput] = useState(initialReport.dateParam);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState(initialReport);
  const abortControllerRef = useRef<AbortController | null>(null);

  async function loadReport(dateParam: string, options?: { pushUrl?: boolean }) {
    abortControllerRef.current?.abort();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(buildDataHref(dateParam), {
        headers: { Accept: "application/json" },
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error("گزارش برای این تاریخ دریافت نشد.");
      }

      const nextReport = (await response.json()) as LunchReportData;
      setReport(nextReport);
      setDateInput(nextReport.dateParam);

      if (options?.pushUrl) {
        window.history.pushState(null, "", buildReportHref(nextReport.dateParam));
      }
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : "گزارش برای این تاریخ دریافت نشد.",
      );
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsLoading(false);
      }
    }
  }

  function navigateToDate(
    event: MouseEvent<HTMLAnchorElement>,
    dateParam: string,
  ) {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    void loadReport(dateParam, { pushUrl: true });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadReport(dateInput, { pushUrl: true });
  }

  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      void loadReport(params.get("date") ?? initialReport.dateParam);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      abortControllerRef.current?.abort();
    };
  }, [initialReport.dateParam]);

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-medium">گزارش روزانه</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {report.dateLabel}، {report.activeReservationCount} رزرو فعال
          </p>
        </div>
        <div className="hidden flex-col gap-2 md:flex md:flex-row">
          <form className="flex gap-2" onSubmit={handleSubmit}>
            <JalaliDatePicker
              disabled={isLoading}
              name="date"
              onValueChange={setDateInput}
              value={dateInput}
            />
            <Button disabled={isLoading} type="submit" variant="outline">
              نمایش
            </Button>
          </form>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border bg-background p-3">
        <div className="grid grid-cols-3 gap-2">
          <Button asChild className="w-full min-w-0" variant="outline">
            <Link
              aria-disabled={isLoading}
              className={isLoading ? "pointer-events-none opacity-60" : undefined}
              href={buildReportHref(report.previousDateParam)}
              onClick={(event) => navigateToDate(event, report.previousDateParam)}
            >
              <ChevronRight className="h-4 w-4" />
              روز قبل
            </Link>
          </Button>
          <Button asChild className="w-full min-w-0" variant="outline">
            <Link
              aria-disabled={isLoading}
              className={isLoading ? "pointer-events-none opacity-60" : undefined}
              href={buildReportHref(report.todayDateParam)}
              onClick={(event) => navigateToDate(event, report.todayDateParam)}
            >
              امروز
            </Link>
          </Button>
          <Button asChild className="w-full min-w-0" variant="outline">
            <Link
              aria-disabled={isLoading}
              className={isLoading ? "pointer-events-none opacity-60" : undefined}
              href={buildReportHref(report.nextDateParam)}
              onClick={(event) => navigateToDate(event, report.nextDateParam)}
            >
              روز بعد
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div
          aria-busy={isLoading}
          className={cn(
            "grid grid-cols-2 gap-2 transition-opacity sm:grid-cols-4 lg:grid-cols-7",
            isLoading ? "opacity-60" : "opacity-100",
          )}
        >
          {report.quickDays.map((quickDay) => (
            <Link
              aria-current={quickDay.isSelected ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md border px-3 py-2 text-center text-sm transition-colors",
                quickDay.isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-muted/20 text-slate-700 hover:bg-accent hover:text-accent-foreground",
              )}
              href={buildReportHref(quickDay.dateParam)}
              key={quickDay.dateParam}
              onClick={(event) => navigateToDate(event, quickDay.dateParam)}
            >
              <span className="font-medium">
                {quickDay.isToday ? "امروز" : quickDay.weekdayLabel}
              </span>
              <span className="text-xs">{quickDay.shortLabel}</span>
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {report.locations.length === 0 ? (
        <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
          هنوز ساختمان فعالی برای گزارش ناهار تعریف نشده است.
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-5 transition-opacity",
            isLoading ? "opacity-60" : "opacity-100",
          )}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {report.locations.map((location) => (
              <div className="rounded-md border bg-background p-4" key={location.id}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">{location.name}</h3>
                  <span className="text-2xl font-semibold text-primary">
                    {location.reservations.length}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {report.activeReservationCount === 0 ? (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              برای این تاریخ رزرو ناهار ثبت نشده است.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border bg-background">
              <div
                className={`grid ${
                  canCancelReservations
                    ? "grid-cols-[1fr_1fr_auto]"
                    : "grid-cols-[1fr_1fr]"
                } border-b bg-muted/30 px-4 py-3 text-sm font-medium text-muted-foreground`}
              >
                <span>نام</span>
                <span>ساختمان</span>
                {canCancelReservations ? <span>عملیات</span> : null}
              </div>
              <div className="divide-y">
                {report.locations.flatMap((location) =>
                  location.reservations.map((reservation) => (
                    <div
                      className={`grid items-center gap-2 ${
                        canCancelReservations
                          ? "grid-cols-[1fr_1fr_auto]"
                          : "grid-cols-[1fr_1fr]"
                      } px-4 py-3 text-sm`}
                      key={reservation.id}
                    >
                      <span>{reservation.userName}</span>
                      <span className="text-muted-foreground">
                        {location.name}
                      </span>
                      {canCancelReservations ? (
                        <form
                          action={cancelLunchReservationByManagerAction}
                          onSubmit={(event) => {
                            if (
                              !confirm(
                                `رزرو ناهار ${reservation.userName} لغو شود؟`,
                              )
                            ) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input name="date" type="hidden" value={report.dateParam} />
                          <input
                            name="reservationId"
                            type="hidden"
                            value={reservation.id}
                          />
                          <SubmitButton
                            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            pendingLabel="در حال لغو..."
                            size="sm"
                            variant="outline"
                          >
                            لغو ناهار
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  )),
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
