import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDateParam } from "@/lib/jalali-date";
import {
  ADMIN_PAGE_LABELS,
  getAdminToast,
  ScheduleExceptions,
  WeeklyScheduleSettings,
} from "@/app/admin/_sections";

type AdminSchedulePageProps = {
  searchParams?: Promise<{
    error?: string;
    exceptionCreated?: string;
    exceptionDeleted?: string;
    exceptionUpdated?: string;
    holidayImported?: string;
    scheduleUpdated?: string;
  }>;
};

export default async function AdminSchedulePage({
  searchParams,
}: AdminSchedulePageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getAdminToast(params);
  const currentJalaliYear = formatJalaliDateParam(new Date()).split("-")[0];
  const [schedules, exceptions] = await Promise.all([
    db.workingSchedule.findMany({
      orderBy: { dayOfWeek: "asc" },
      select: {
        id: true,
        dayOfWeek: true,
        isWorkingDay: true,
        startTime: true,
        endTime: true,
      },
    }),
    db.scheduleException.findMany({
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        isWorkingDay: true,
        startTime: true,
        endTime: true,
        reason: true,
      },
    }),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader
        subtitle="تنظیم روزهای کاری، ساعت‌ها و استثناهای تاریخ‌محور"
        title={ADMIN_PAGE_LABELS.schedule}
      />

      {toast ? <UrlToast {...toast} /> : null}
      <WeeklyScheduleSettings schedules={schedules} />
      <ScheduleExceptions
        currentJalaliYear={currentJalaliYear}
        exceptions={exceptions}
      />
    </div>
  );
}
