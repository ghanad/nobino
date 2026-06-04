import { redirect } from "next/navigation";

import { LunchReportView } from "@/app/lunch/report/lunch-report-view";
import { PageHeader } from "@/components/app/page-header";
import { requireCurrentUser } from "@/lib/auth";
import { parseJalaliDateParam } from "@/lib/jalali-date";
import { getLunchReportForDate } from "@/lib/lunch-report-service";
import { canAccessLunchReport } from "@/lib/permissions";

type LunchReportPageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

export default async function LunchReportPage({
  searchParams,
}: LunchReportPageProps) {
  const user = await requireCurrentUser();

  if (!canAccessLunchReport(user)) {
    redirect("/lunch");
  }

  const params = await searchParams;
  const reportDate = parseJalaliDateParam(params?.date) ?? new Date();
  const report = await getLunchReportForDate(reportDate);

  return (
    <div className="grid gap-6 text-right" dir="rtl">
      <PageHeader
        subtitle="لیست روزانه رزروهای فعال ناهار بر اساس ساختمان"
        title="گزارش روزانه ناهار"
      />

      <LunchReportView initialReport={report} />
    </div>
  );
}
