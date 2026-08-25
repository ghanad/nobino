import {
  formatTeamReportRangeForCaption,
  type TeamReservationReport,
} from "@/lib/team-reservation-report-service";

import {
  formatPersianNumber,
  RailFigure,
  RankedBoard,
  ReportSection,
  reportTableCellClass,
  reportTableHeadCellClass,
  reportTableNameCellClass,
  type RankedBoardRow,
} from "./report-ui";

function buildTeamBoardRows(
  report: TeamReservationReport,
): RankedBoardRow[] {
  const shareBase = report.totalAttributedHours;

  return report.teams.map((team) => ({
    id: team.name,
    label: team.name,
    sharePercent:
      shareBase > 0 ? Math.round((team.approvedHours / shareBase) * 100) : 0,
    sub:
      team.memberCount > 0
        ? `${formatPersianNumber(team.reservationCount)} رزرو · میانگین ${formatPersianNumber(team.averageHoursPerMember)} ساعت برای هر عضو`
        : `${formatPersianNumber(team.reservationCount)} رزرو · بدون عضو تعریف‌شده`,
    value: team.approvedHours,
    valueLabel: `${formatPersianNumber(team.approvedHours)} ساعت`,
  }));
}

export function TeamReportRail({
  report,
}: {
  report: TeamReservationReport;
}) {
  return (
    <>
      <RailFigure
        hint="کل واقعی رزروهای تاییدشده در این بازه"
        title="ساعت تاییدشده واقعی"
        value={`${formatPersianNumber(report.totalApprovedHours)} ساعت`}
      />
      <RailFigure
        hint="در عضویت چندتیمی ممکن است از کل واقعی بیشتر شود"
        title="ساعت نسبت‌داده‌شده"
        value={`${formatPersianNumber(report.totalAttributedHours)} ساعت`}
      />
      <RailFigure
        hint="فقط رزروهای تاییدشده شمرده می‌شوند"
        title="تعداد رزرو تاییدشده"
        value={formatPersianNumber(report.totalApprovedReservationCount)}
      />
      <RailFigure
        hint="کاربران یکتای رزروکننده در این بازه"
        title="کاربران رزروکننده"
        value={formatPersianNumber(report.totalReservingUsers)}
      />
    </>
  );
}

export function TeamReportBody({
  report,
}: {
  report: TeamReservationReport;
}) {
  return (
    <>
      <ReportSection
        caption={`نمودار بر اساس ساعت رزرو تاییدشده در ${formatTeamReportRangeForCaption(report)}`}
        title="مقایسه تیم‌ها"
      >
        <RankedBoard
          emptyLabel="هنوز تیمی تعریف نشده است و مصرف بدون تیمی هم در این بازه وجود ندارد."
          rows={buildTeamBoardRows(report)}
        />
      </ReportSection>

      <ReportSection
        caption="عضویت‌ها بر اساس تیم‌های فعلی کاربر محاسبه شده‌اند."
        title="جزئیات تیم‌ها"
      >
        {report.teams.length === 0 ? (
          <div className="border-t border-dashed px-5 py-5 text-sm text-muted-foreground">
            داده‌ای برای نمایش وجود ندارد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border/80 bg-muted/30">
                <tr>
                  <th className={reportTableHeadCellClass}>نام تیم</th>
                  <th className={reportTableHeadCellClass}>ساعت تاییدشده</th>
                  <th className={reportTableHeadCellClass}>تعداد رزرو</th>
                  <th className={reportTableHeadCellClass}>کاربران رزروکننده</th>
                  <th className={reportTableHeadCellClass}>تعداد اعضا</th>
                  <th className={reportTableHeadCellClass}>میانگین ساعت به ازای عضو</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {report.teams.map((team) => (
                  <tr className="transition-colors hover:bg-muted/40" key={team.name}>
                    <td className={reportTableNameCellClass}>{team.name}</td>
                    <td className={reportTableCellClass}>
                      {formatPersianNumber(team.approvedHours)}
                    </td>
                    <td className={reportTableCellClass}>
                      {formatPersianNumber(team.reservationCount)}
                    </td>
                    <td className={reportTableCellClass}>
                      {formatPersianNumber(team.reservingUserCount)}
                    </td>
                    <td className={reportTableCellClass}>
                      {formatPersianNumber(team.memberCount)}
                    </td>
                    <td className={reportTableCellClass}>
                      {formatPersianNumber(team.averageHoursPerMember)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>
    </>
  );
}
