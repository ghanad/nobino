import {
  CalendarDayOverrideMode,
  CalendarDayTargetType,
  ScheduleExceptionSource,
  UserRole,
} from "@prisma/client";
import { Info } from "lucide-react";
import { SpacesReservationSectionShell } from "@/app/admin/_components/spaces-reservation-section";

import {
  getAdminToast,
  OfficialHolidaySettings,
  WeeklyScheduleSettings,
} from "@/app/admin/_sections";
import {
  EditDeleteMenu,
  InlineCreationSection,
} from "@/app/admin/calendar/calendar-client-components";
import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getIranHolidayForDate } from "@/lib/iran-holidays";
import { formatJalaliDate } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type CalendarPageProps = {
  searchParams?: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
    exceptionCreated?: string;
    exceptionDeleted?: string;
    exceptionUpdated?: string;
    holidayCreated?: string;
    holidayDeleted?: string;
    holidayManualPreserved?: string;
    holidayUpdated?: string;
    scheduleUpdated?: string;
    updated?: string;
    view?: string;
  }>;
};

const MODE_DETAILS = {
  [CalendarDayOverrideMode.CLOSED]: {
    className: "bg-slate-100 text-slate-700",
    label: "تعطیل",
  },
  [CalendarDayOverrideMode.NORMAL]: {
    className: "bg-emerald-50 text-emerald-700",
    label: "طبق برنامه هفتگی",
  },
  [CalendarDayOverrideMode.CUSTOM]: {
    className: "bg-blue-50 text-blue-700",
    label: "ساعات ویژه",
  },
};

const MODE_HOURS_CLASS = {
  [CalendarDayOverrideMode.CLOSED]: "text-slate-500",
  [CalendarDayOverrideMode.NORMAL]: "text-slate-500",
  [CalendarDayOverrideMode.CUSTOM]: "text-blue-700",
};

type CalendarView = "exceptions" | "special-days" | "weekly";

function parseCalendarView(value?: string): CalendarView {
  if (value === "weekly" || value === "exceptions") {
    return value;
  }

  return "special-days";
}

function getToast(params: Awaited<CalendarPageProps["searchParams"]>) {
  const adminToast = getAdminToast(params);

  if (adminToast) {
    return adminToast;
  }

  const message =
    (params?.created && "استثنا ثبت شد.") ||
    (params?.updated && "استثنا به‌روزرسانی شد.") ||
    (params?.deleted && "استثنا حذف شد.");

  return message
    ? {
        consumeKeys: ["created", "updated", "deleted"],
        message,
        variant: "success" as const,
      }
    : null;
}

function formatTimeRange(startTime: string | null, endTime: string | null): string {
  if (!startTime || !endTime) return "";
  return `${startTime} تا ${endTime}`;
}

function getTargetTypeLabel(type: CalendarDayTargetType): string {
  switch (type) {
    case CalendarDayTargetType.SYSTEMS:
      return "سامانه‌ها";
    case CalendarDayTargetType.LUNCH:
      return "غذا";
    case CalendarDayTargetType.BUILDING:
      return "دفترها";
    case CalendarDayTargetType.MEETING_ROOM:
      return "اتاق‌ها";
  }
}

export default async function AdminCalendarPage({
  searchParams,
}: CalendarPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const activeView = parseCalendarView(params?.view);
  const toast = getToast(params);

  const [overrides, buildings, rooms, schedules, holidays] =
    await Promise.all([
      db.calendarDayOverride.findMany({
        include: { targets: true },
        orderBy: { date: "asc" },
      }),
      db.building.findMany({
        where: { active: true, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
      db.meetingRoom.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
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
        where: { source: ScheduleExceptionSource.IRAN_HOLIDAY },
        orderBy: { date: "asc" },
        select: {
          date: true,
          reason: true,
        },
      }),
    ]);

  const holidaySources = await Promise.all(
    overrides.map((override) => getIranHolidayForDate(override.date)),
  );

  // Build a map of which overrides have an official holiday
  const holidayMap = new Map<string, { title: string } | null>();
  overrides.forEach((override, index) => {
    const holiday = holidaySources[index];
    holidayMap.set(override.id, holiday ? { title: holiday.title } : null);
  });

  return (
    <SpacesReservationSectionShell>
      <PageHeader
        subtitle="تعریف روزهای خاص و استثناهای تقویم"
        title="تقویم و ساعات کاری"
      />
      {toast ? <UrlToast {...toast} /> : null}

      <main className="grid min-w-0 gap-6">
        {activeView === "special-days" ? (
          <>
            {/* Inline creation form — hidden by default */}
            <InlineCreationSection
              buildings={buildings}
              rooms={rooms}
            />

            {/* Existing overrides */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-950">
                  استثناهای تقویم
                </h2>
                <span className="text-sm text-muted-foreground">
                  {overrides.length.toLocaleString("fa-IR")} مورد
                </span>
              </div>

              {overrides.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  <p>هنوز روز خاصی ثبت نشده است.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50/50 text-right text-xs font-medium text-muted-foreground">
                          <th className="px-4 py-2.5 font-medium">تاریخ</th>
                          <th className="px-4 py-2.5 font-medium">رفتار</th>
                          <th className="hidden px-4 py-2.5 font-medium sm:table-cell">ساعات</th>
                          <th className="hidden px-4 py-2.5 font-medium md:table-cell">سرویس‌ها</th>
                          <th className="hidden px-4 py-2.5 font-medium lg:table-cell">دلیل</th>
                          <th className="w-12 px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {overrides.map((override) => {
                          const modeDetail = MODE_DETAILS[override.mode];
                          const officialHoliday = holidayMap.get(override.id);
                          const targetTypes = new Set(
                            override.targets.map((target) => target.type),
                          );
                          const targetCount = override.targets.length;
                          const timeRange = formatTimeRange(
                            override.startTime,
                            override.endTime,
                          );

                          return (
                            <tr
                              className="border-b last:border-b-0 hover:bg-slate-50/50"
                              key={override.id}
                            >
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-950">
                                  {formatJalaliDate(override.date)}
                                </div>
                                {officialHoliday ? (
                                  <div className="text-xs text-muted-foreground">
                                    منبع: {officialHoliday.title}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={cn(
                                    "inline-flex rounded-md px-2 py-1 text-xs font-medium",
                                    modeDetail.className,
                                  )}
                                >
                                  {modeDetail.label}
                                </span>
                              </td>
                              <td className="hidden px-4 py-3 sm:table-cell">
                                {timeRange ? (
                                  <span className={cn(
                                    "text-xs",
                                    MODE_HOURS_CLASS[override.mode],
                                  )}>
                                    {timeRange}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )}
                              </td>
                              <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                                <div>
                                  {targetCount.toLocaleString("fa-IR")} سرویس
                                </div>
                                <div className="text-xs">
                                  {[...targetTypes]
                                    .map(getTargetTypeLabel)
                                    .join("، ")}
                                </div>
                              </td>
                              <td className="hidden max-w-[200px] truncate px-4 py-3 text-muted-foreground lg:table-cell">
                                {override.reason || "—"}
                              </td>
                              <td className="px-4 py-3">
                                <EditDeleteMenu
                                  buildings={buildings}
                                  override={override}
                                  rooms={rooms}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* Precedence note */}
            <div className="flex items-start gap-2 rounded-md bg-blue-50/60 px-3 py-2 text-xs leading-5 text-blue-800/80">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                استثناهای اختصاصی هر سرویس نسبت به این تنظیم اولویت دارند.
              </p>
            </div>
          </>
        ) : activeView === "weekly" ? (
          <WeeklyScheduleSettings schedules={schedules} />
        ) : (
          <OfficialHolidaySettings
            currentJalaliYear={new Date().toLocaleDateString("fa-IR-u-ca-persian", { year: "numeric" })}
            holidays={holidays}
          />
        )}
      </main>
    </SpacesReservationSectionShell>
  );
}