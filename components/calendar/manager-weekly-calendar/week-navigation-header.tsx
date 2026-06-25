"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buildDateHref } from "./formatting";
import { cn } from "@/lib/utils";

export function WeekNavigationHeader({
  isCurrentWeek,
  nextWeekDateParam,
  previousWeekDateParam,
  todayDateParam,
  weekLabel,
}: {
  isCurrentWeek: boolean;
  nextWeekDateParam: string;
  previousWeekDateParam: string;
  todayDateParam: string;
  weekLabel: string;
}) {
  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3" dir="rtl">
      <div
        className="hidden grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:grid"
        dir="ltr"
      >
        <Link
          className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
          href={buildDateHref(previousWeekDateParam)}
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span dir="rtl">هفته قبل</span>
        </Link>
        <div
          className={cn(
            "h-16 text-center",
            isCurrentWeek
              ? "flex items-center justify-center"
              : "grid content-center justify-items-center gap-2",
          )}
          dir="rtl"
        >
          <p className="text-sm font-medium">{weekLabel}</p>
          {!isCurrentWeek ? (
            <Link
              className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md bg-sky-50 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-sky-100 hover:text-slate-800"
              href={buildDateHref(todayDateParam)}
            >
              بازگشت به هفته جاری
            </Link>
          ) : null}
        </div>
        <Link
          className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
          href={buildDateHref(nextWeekDateParam)}
        >
          <span dir="rtl">هفته بعد</span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </Link>
      </div>

      <div className="text-center sm:hidden">
        <p className="text-sm font-medium">{weekLabel}</p>
      </div>
      <div className="flex items-center gap-2 sm:hidden" dir="ltr">
        <Link
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent"
          href={buildDateHref(previousWeekDateParam)}
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span dir="rtl">هفته قبل</span>
        </Link>
        <Link
          className="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-md border bg-muted/60 px-2 text-sm font-medium hover:bg-accent"
          href={buildDateHref(todayDateParam)}
        >
          امروز
        </Link>
        <Link
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent"
          href={buildDateHref(nextWeekDateParam)}
        >
          <span dir="rtl">هفته بعد</span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </Link>
      </div>
    </div>
  );
}
