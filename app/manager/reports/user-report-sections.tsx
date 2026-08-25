import {
  formatUserReportRangeForCaption,
  type UserReservationReport,
} from "@/lib/user-reservation-report-service";

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

function buildUserBoardRows(
  report: UserReservationReport,
): RankedBoardRow[] {
  const shareBase = report.totalApprovedHours;

  return report.users.map((user) => ({
    id: user.id,
    label: user.name,
    sharePercent:
      shareBase > 0 ? Math.round((user.approvedHours / shareBase) * 100) : 0,
    sub:
      user.teamNames.length > 0 ? user.teamNames.join("، ") : "بدون تیم",
    value: user.approvedHours,
    valueLabel: `${formatPersianNumber(user.approvedHours)} ساعت`,
  }));
}

export function UserReportRail({
  report,
}: {
  report: UserReservationReport;
}) {
  return (
    <>
      <RailFigure
        hint="کل واقعی رزروهای تاییدشده در این بازه"
        title="ساعت تاییدشده"
        value={`${formatPersianNumber(report.totalApprovedHours)} ساعت`}
      />
      <RailFigure
        hint="فقط رزروهای تاییدشده شمرده می‌شوند"
        title="تعداد رزرو تاییدشده"
        value={formatPersianNumber(report.totalApprovedReservationCount)}
      />
      <RailFigure
        hint="کاربرانی که حداقل یک رزرو تاییدشده دارند"
        title="کاربران رزروکننده"
        value={formatPersianNumber(report.totalReservingUsers)}
      />
    </>
  );
}

export function UserReportBody({
  report,
}: {
  report: UserReservationReport;
}) {
  return (
    <>
      <ReportSection
        caption={`نمودار بر اساس ساعت رزرو تاییدشده در ${formatUserReportRangeForCaption(report)}`}
        title="مقایسه کاربران"
      >
        <RankedBoard
          emptyLabel="در این بازه رزرو تاییدشده‌ای ثبت نشده است."
          rows={buildUserBoardRows(report)}
        />
      </ReportSection>

      <ReportSection
        caption="تیم‌ها بر اساس عضویت‌های فعلی کاربر نمایش داده شده‌اند."
        title="جزئیات کاربران"
      >
        {report.users.length === 0 ? (
          <div className="border-t border-dashed px-5 py-5 text-sm text-muted-foreground">
            داده‌ای برای نمایش وجود ندارد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border/80 bg-muted/30">
                <tr>
                  <th className={reportTableHeadCellClass}>نام</th>
                  <th className={reportTableHeadCellClass}>تیم‌ها</th>
                  <th className={reportTableHeadCellClass}>ساعت تاییدشده</th>
                  <th className={reportTableHeadCellClass}>تعداد رزرو</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {report.users.map((user) => (
                  <tr className="transition-colors hover:bg-muted/40" key={user.id}>
                    <td className={reportTableNameCellClass}>{user.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {user.teamNames.join("، ")}
                    </td>
                    <td className={reportTableCellClass}>
                      {formatPersianNumber(user.approvedHours)}
                    </td>
                    <td className={reportTableCellClass}>
                      {formatPersianNumber(user.reservationCount)}
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
