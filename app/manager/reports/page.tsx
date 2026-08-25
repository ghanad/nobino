import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth";
import {
  getDeskPeopleReport,
} from "@/lib/desk-people-report-service";
import {
  getTeamReservationReport,
} from "@/lib/team-reservation-report-service";
import {
  getUserReservationReport,
} from "@/lib/user-reservation-report-service";

import { DeskReportBody, DeskReportRail } from "./desk-report-sections";
import {
  parseReportPeriod,
  parseReportView,
  RailGroupLabel,
  ReportPeriodToggle,
  ReportRangeNavigation,
  ReportViewToggle,
  type ReportRangeInfo,
  type ReportView,
} from "./report-ui";
import { TeamReportBody, TeamReportRail } from "./team-report-sections";
import { UserReportBody, UserReportRail } from "./user-report-sections";

// DESIGN CONTRACT — Split Cockpit (dealt 3 of 7, seed 7d97f391)
// THESIS: an instrument panel — controls and headline figures hold a
// persistent rail while the report pane scrolls; refuses the stacked
// control-card page with floating summary tiles.
// OWN-WORLD: Nobino's quiet service desk — white canvas, action blue, ink
// navy, hairline rules, flat at rest, IRANSansX, Persian RTL.
// STORY: the manager switches view, period, and range without losing their
// place, reads the pulse from the rail figures, then scans the ranked board
// and the full details table.
// FIRST VIEWPORT: header; right rail (view list, period, Jalali range with
// prev/today/next, ruled totals); main pane ranked comparison board with
// share-of-total, details table below.
// FORM: Split Cockpit, dealt index 3 of 7, seed key 7d97f391.
// FINISH: unreviewed and undocumented is unfinished; this build ends with
// the finish review, the verdict, and DESIGN.md.

type ReportsPageProps = {
  searchParams?: Promise<{
    date?: string;
    period?: string;
    view?: string;
  }>;
};

async function loadActiveReport(
  view: ReportView,
  input: { date?: string; period?: string },
): Promise<{ body: React.ReactNode; rail: React.ReactNode; range: ReportRangeInfo }> {
  if (view === "team") {
    const report = await getTeamReservationReport(input);

    return {
      body: <TeamReportBody report={report} />,
      rail: <TeamReportRail report={report} />,
      range: report,
    };
  }

  if (view === "user") {
    const report = await getUserReservationReport(input);

    return {
      body: <UserReportBody report={report} />,
      rail: <UserReportRail report={report} />,
      range: report,
    };
  }

  const report = await getDeskPeopleReport(input);

  return {
    body: <DeskReportBody report={report} />,
    rail: <DeskReportRail report={report} />,
    range: report,
  };
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  await requireRole([UserRole.MANAGER, UserRole.ADMIN]);
  const params = await searchParams;
  const view = parseReportView(params?.view);
  const period = parseReportPeriod(params?.period);
  const input = { date: params?.date, period: params?.period };
  const { body, rail, range } = await loadActiveReport(view, input);

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="گزارش مصرف رزروها به تفکیک تیم، کاربر و میز کاری، فقط بر پایه رزروهای تاییدشده"
        title="گزارش‌ها"
      />

      <div className="grid items-start gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="flex flex-col rounded-lg border bg-muted/20 p-5 lg:sticky lg:top-8">
          <nav aria-label="تنظیمات گزارش">
            <div className="grid gap-2">
              <RailGroupLabel>نما</RailGroupLabel>
              <ReportViewToggle
                activeView={view}
                dateParam={params?.date}
                period={period}
              />
            </div>

            <div className="mt-5 border-t border-border/70 pt-5">
              <RailGroupLabel>بازه</RailGroupLabel>
              <div className="mt-3 grid gap-3">
                <ReportPeriodToggle
                  activePeriod={period}
                  dateParam={params?.date}
                  view={view}
                />
                <div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {range.period === "week" ? "بازه هفتگی" : "بازه ماهانه"}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold leading-7 text-slate-950">
                    {range.rangeLabel}
                  </p>
                </div>
                <ReportRangeNavigation range={range} view={view} />
              </div>
            </div>
          </nav>

          <div className="mt-5 border-t border-border/70 pt-5">
            <RailGroupLabel>جمع‌بندی بازه</RailGroupLabel>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {rail}
            </div>
          </div>
        </aside>

        <div className="grid min-w-0 gap-6">{body}</div>
      </div>
    </div>
  );
}
