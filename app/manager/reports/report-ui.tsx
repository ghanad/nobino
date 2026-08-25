import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type ReportView = "desk" | "team" | "user";
export type ReportPeriod = "month" | "week";

export type ReportRangeInfo = {
  dateParam: string;
  nextDateParam: string;
  period: ReportPeriod;
  previousDateParam: string;
  rangeLabel: string;
  todayDateParam: string;
};

export function parseReportView(value?: string): ReportView {
  return value === "user" || value === "desk" ? value : "team";
}

export function parseReportPeriod(value?: string): ReportPeriod {
  return value === "week" ? "week" : "month";
}

export function buildReportsHref(
  view: ReportView,
  period: ReportPeriod,
  dateParam?: string,
): string {
  const search = new URLSearchParams({ period, view });

  if (dateParam) {
    search.set("date", dateParam);
  }

  return `/manager/reports?${search.toString()}`;
}

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR", {
  maximumFractionDigits: 1,
});

export function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

const VIEW_TOGGLE_ITEMS: Array<{ label: string; value: ReportView }> = [
  { label: "تیم‌ها", value: "team" },
  { label: "کاربران", value: "user" },
  { label: "میزها", value: "desk" },
];

const PERIOD_TOGGLE_ITEMS: Array<{ label: string; value: ReportPeriod }> = [
  { label: "هفتگی", value: "week" },
  { label: "ماهانه", value: "month" },
];

export function ReportViewToggle({
  activeView,
  dateParam,
  period,
}: {
  activeView: ReportView;
  dateParam?: string;
  period: ReportPeriod;
}) {
  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 lg:grid-cols-1"
      role="group"
    >
      {VIEW_TOGGLE_ITEMS.map((item) => {
        const isActive = item.value === activeView;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors lg:h-9 lg:justify-start",
              isActive
                ? "border-border bg-card text-slate-950 shadow-sm"
                : "border-transparent text-slate-600 hover:bg-card/60 hover:text-slate-950",
            )}
            href={buildReportsHref(item.value, period, dateParam)}
            key={item.value}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function ReportPeriodToggle({
  activePeriod,
  dateParam,
  view,
}: {
  activePeriod: ReportPeriod;
  dateParam?: string;
  view: ReportView;
}) {
  return (
    <div className="inline-flex self-start rounded-lg bg-muted p-1" role="group">
      {PERIOD_TOGGLE_ITEMS.map((item) => {
        const isActive = item.value === activePeriod;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors lg:h-8",
              isActive
                ? "border-border bg-card text-slate-950 shadow-sm"
                : "border-transparent text-slate-600 hover:text-slate-950",
            )}
            href={buildReportsHref(view, item.value, dateParam)}
            key={item.value}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function ReportRangeNavigation({
  range,
  view,
}: {
  range: ReportRangeInfo;
  view: ReportView;
}) {
  const buildDateHref = (dateParam: string) =>
    buildReportsHref(view, range.period, dateParam);
  const linkClass =
    "inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-md border border-border/80 bg-card px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-muted hover:text-slate-950 lg:h-9";

  return (
    <div className="flex items-center gap-2" role="group">
      <Link className={linkClass} href={buildDateHref(range.previousDateParam)}>
        <ChevronRight className="h-3.5 w-3.5" />
        بازه قبل
      </Link>
      <Link className={linkClass} href={buildDateHref(range.todayDateParam)}>
        امروز
      </Link>
      <Link className={linkClass} href={buildDateHref(range.nextDateParam)}>
        بازه بعد
        <ChevronLeft className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export function RailGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium leading-5 text-muted-foreground">
      {children}
    </p>
  );
}

export function RailFigure({
  hint,
  title,
  value,
}: {
  hint: string;
  title: string;
  value: string;
}) {
  return (
    <div className="grid gap-1">
      <p className="text-xs font-medium leading-5 text-muted-foreground">
        {title}
      </p>
      <p className="text-xl font-semibold leading-7 tabular-nums text-slate-950">
        {value}
      </p>
      <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ReportSection({
  caption,
  children,
  title,
}: {
  caption?: string;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b border-border/80 px-5 py-4">
        <h2 className="font-medium text-slate-950">{title}</h2>
        {caption ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {caption}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export type RankedBoardRow = {
  id: string;
  label: string;
  sharePercent: number;
  sub?: string;
  value: number;
  valueLabel: string;
};

export function RankedBoard({
  emptyLabel,
  rows,
}: {
  emptyLabel: string;
  rows: RankedBoardRow[];
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 0);

  if (rows.length === 0) {
    return (
      <div className="border-t border-dashed px-5 py-5 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ol className="grid gap-4 px-5 py-5">
      {rows.map((row, index) => {
        const widthPercent =
          maxValue > 0 ? (row.value / maxValue) * 100 : 0;

        return (
          <li
            className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2.5"
            key={row.id}
          >
            <span className="pt-0.5 text-xs leading-5 tabular-nums text-muted-foreground">
              {formatPersianNumber(index + 1)}
            </span>
            <div className="grid gap-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium leading-5 text-slate-950"
                    title={row.label}
                  >
                    {row.label}
                  </p>
                  {row.sub ? (
                    <p
                      className="truncate text-xs leading-5 text-muted-foreground"
                      title={row.sub}
                    >
                      {row.sub}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 leading-5">
                  <span className="text-sm font-semibold tabular-nums text-slate-950">
                    {row.valueLabel}
                  </span>
                  <span className="mr-2 text-xs tabular-nums text-muted-foreground">
                    {formatPersianNumber(row.sharePercent)}٪ از کل
                  </span>
                </p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="report-bar-fill h-full rounded-full bg-primary"
                  style={{
                    width: `${widthPercent}%`,
                    animationDelay: `${Math.min(index * 45, 450)}ms`,
                  }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export const reportTableHeadCellClass =
  "px-4 py-2.5 text-right text-xs font-medium text-muted-foreground";

export const reportTableNameCellClass =
  "px-4 py-3 text-sm font-medium text-slate-950";

export const reportTableCellClass =
  "px-4 py-3 text-sm tabular-nums text-slate-700";
