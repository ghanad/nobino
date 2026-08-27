import { UserRole } from "@prisma/client";
import { CalendarDays, Clock3 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatJalaliDateParam } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";
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
    holidayCreated?: string;
    holidayUpdated?: string;
    holidayDeleted?: string;
    holidayManualPreserved?: string;
    scheduleUpdated?: string;
    view?: string;
  }>;
};

type ScheduleView = "exceptions" | "weekly";

function getView(value: string | undefined): ScheduleView {
  return value === "exceptions" ? "exceptions" : "weekly";
}

function ScheduleNavigation({
  activeView,
  exceptionCount,
}: {
  activeView: ScheduleView;
  exceptionCount: number;
}) {
  const items: Array<{
    description: string;
    href: string;
    icon: ReactNode;
    label: string;
    view: ScheduleView;
  }> = [
    {
      description: "روزها و ساعت‌های رزرو",
      href: "/admin/schedule",
      icon: <Clock3 className="h-[18px] w-[18px]" />,
      label: "برنامه هفتگی",
      view: "weekly",
    },
    {
      description: `${exceptionCount} مورد ثبت‌شده`,
      href: "/admin/schedule?view=exceptions",
      icon: <CalendarDays className="h-[18px] w-[18px]" />,
      label: "استثناهای تقویم",
      view: "exceptions",
    },
  ];

  return (
    <nav
      aria-label="بخش‌های مدیریت زمان‌بندی"
      className="flex overflow-x-auto border-b bg-slate-50 px-2 pt-2"
    >
      {items.map((item) => {
        const isActive = item.view === activeView;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative grid min-w-[210px] flex-1 gap-1 rounded-t-lg px-4 py-3 text-right transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              isActive
                ? "bg-white text-slate-950 shadow-sm after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:bg-primary"
                : "text-slate-600 hover:bg-blue-50/50 hover:text-slate-950",
            )}
            href={item.href}
            key={item.view}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className={cn(isActive && "text-primary")}>{item.icon}</span>
              {item.label}
            </span>
            <span className="truncate text-xs">{item.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default async function AdminSchedulePage({
  searchParams,
}: AdminSchedulePageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const activeView = getView(params?.view);
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
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <ScheduleNavigation
          activeView={activeView}
          exceptionCount={exceptions.length}
        />
        <main className="p-5">
          {activeView === "weekly" ? (
            <WeeklyScheduleSettings schedules={schedules} />
          ) : (
            <ScheduleExceptions
              currentJalaliYear={currentJalaliYear}
              exceptions={exceptions}
            />
          )}
        </main>
      </div>
    </div>
  );
}
