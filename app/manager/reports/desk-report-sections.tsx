import {
  formatDeskReportRangeForCaption,
  type DeskPeopleReport,
} from "@/lib/desk-people-report-service";

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

function buildDeskBoardRows(report: DeskPeopleReport): RankedBoardRow[] {
  const shareBase = report.totalApprovedHours;

  return report.people.map((person) => ({
    id: person.name,
    label: person.name,
    sharePercent:
      shareBase > 0 ? Math.round((person.approvedHours / shareBase) * 100) : 0,
    sub: `${formatPersianNumber(person.reservationCount)} رزرو · ${formatPersianNumber(person.distinctDays)} روز`,
    value: person.approvedHours,
    valueLabel: `${formatPersianNumber(person.approvedHours)} ساعت`,
  }));
}

export function DeskReportRail({
  report,
}: {
  report: DeskPeopleReport;
}) {
  return (
    <>
      <RailFigure
        hint="کل واقعی رزروهای تاییدشده میزها در این بازه"
        title="ساعت تاییدشده"
        value={`${formatPersianNumber(report.totalApprovedHours)} ساعت`}
      />
      <RailFigure
        hint="فقط رزروهای تاییدشده شمرده می‌شوند"
        title="تعداد رزرو تاییدشده"
        value={formatPersianNumber(report.totalApprovedReservationCount)}
      />
      <RailFigure
        hint="افرادی که حداقل یک رزرو تاییدشده دارند"
        title="تعداد افراد فعال"
        value={formatPersianNumber(report.activePeopleCount)}
      />
    </>
  );
}

export function DeskReportBody({ report }: { report: DeskPeopleReport }) {
  return (
    <>
      <ReportSection
        caption={`نمودار بر اساس ساعت رزرو تاییدشده میزها در ${formatDeskReportRangeForCaption(report)}`}
        title="مقایسه افراد"
      >
        <RankedBoard
          emptyLabel="در این بازه رزرو تاییدشده‌ای برای میزهای کاری وجود ندارد."
          rows={buildDeskBoardRows(report)}
        />
      </ReportSection>

      <ReportSection
        caption={`ساعت رزرو تاییدشده میزها بر اساس ${formatDeskReportRangeForCaption(report)}`}
        title="جزئیات افراد"
      >
        {report.people.length === 0 ? (
          <div className="border-t border-dashed px-5 py-5 text-sm text-muted-foreground">
            داده‌ای برای نمایش وجود ندارد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border/80 bg-muted/30">
                <tr>
                  <th className={reportTableHeadCellClass}>نام</th>
                  <th className={reportTableHeadCellClass}>ساعت تاییدشده</th>
                  <th className={reportTableHeadCellClass}>تعداد رزرو</th>
                  <th className={reportTableHeadCellClass}>تعداد روز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {report.people.map((person) => (
                  <tr className="transition-colors hover:bg-muted/40" key={person.name}>
                    <td className={reportTableNameCellClass}>{person.name}</td>
                    <td className={reportTableCellClass}>
                      {formatPersianNumber(person.approvedHours)}
                    </td>
                    <td className={reportTableCellClass}>
                      {formatPersianNumber(person.reservationCount)}
                    </td>
                    <td className={reportTableCellClass}>
                      {formatPersianNumber(person.distinctDays)}
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
