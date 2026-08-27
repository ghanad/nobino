import {
  CalendarDayOverrideMode,
  CalendarDayTargetType,
  UserRole,
} from "@prisma/client";
import {
  CalendarClock,
  CalendarCog,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  Info,
} from "lucide-react";
import Link from "next/link";

import {
  getAdminToast,
  ScheduleExceptions,
  WeeklyScheduleSettings,
} from "@/app/admin/_sections";
import { CalendarOverrideForm } from "@/app/admin/calendar/calendar-override-form";
import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { GLOBAL_CALENDAR_TARGET_KEY } from "@/lib/calendar-day-override-service";
import { db } from "@/lib/db";
import { getIranHolidayForDate } from "@/lib/iran-holidays";
import { formatJalaliDate, formatJalaliDateParam } from "@/lib/jalali-date";
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
    className: "bg-emerald-50 text-emerald-800",
    label: "روز عادی",
  },
  [CalendarDayOverrideMode.CUSTOM]: {
    className: "bg-blue-50 text-blue-800",
    label: "برنامه ویژه",
  },
};

type CalendarView = "exceptions" | "special-days" | "weekly";

function parseCalendarView(value?: string): CalendarView {
  if (value === "weekly" || value === "exceptions") {
    return value;
  }

  return "special-days";
}

function CalendarRail({ activeView }: { activeView: CalendarView }) {
  const items: Array<{
    icon: typeof CalendarRange;
    label: string;
    shortLabel: string;
    value: CalendarView;
  }> = [
    {
      icon: CalendarRange,
      label: "روزهای خاص",
      shortLabel: "روزهای خاص",
      value: "special-days",
    },
    {
      icon: CalendarClock,
      label: "برنامه هفتگی سامانه‌ها",
      shortLabel: "برنامه هفتگی",
      value: "weekly",
    },
    {
      icon: CalendarDays,
      label: "استثناهای سامانه‌ها",
      shortLabel: "استثناها",
      value: "exceptions",
    },
  ];

  return (
    <aside className="flex flex-col rounded-lg border bg-muted/20 p-3 sm:p-5 lg:sticky lg:top-8">
      <nav aria-label="بخش‌های تقویم و ساعات کاری">
        <p className="text-xs font-medium leading-5 text-muted-foreground">
          بخش‌ها
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 lg:grid-cols-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.value === activeView;
            const href =
              item.value === "special-days"
                ? "/admin/calendar"
                : `/admin/calendar?view=${item.value}`;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-center text-xs font-medium transition-colors lg:min-h-12 lg:justify-start lg:px-4 lg:text-sm",
                  isActive
                    ? "border-border bg-card text-slate-950 shadow-sm"
                    : "border-transparent text-slate-600 hover:bg-card/60 hover:text-slate-950",
                )}
                href={href}
                key={item.value}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate lg:hidden">
                  {item.shortLabel}
                </span>
                <span className="hidden min-w-0 truncate lg:inline">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function getToast(params: Awaited<CalendarPageProps["searchParams"]>) {
  const adminToast = getAdminToast(params);

  if (adminToast) {
    return adminToast;
  }

  const message =
    (params?.created && "اصلاح تاریخ ثبت شد.") ||
    (params?.updated && "اصلاح تاریخ به‌روزرسانی شد.") ||
    (params?.deleted && "اصلاح تاریخ حذف شد.");

  return message
    ? {
        consumeKeys: ["created", "updated", "deleted"],
        message,
        variant: "success" as const,
      }
    : null;
}

export default async function AdminCalendarPage({
  searchParams,
}: CalendarPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const activeView = parseCalendarView(params?.view);
  const toast = getToast(params);
  const currentJalaliYear = formatJalaliDateParam(new Date()).split("-")[0];
  const [overrides, buildings, rooms, schedules, exceptions] =
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
  const holidaySources = await Promise.all(
    overrides.map((override) => getIranHolidayForDate(override.date)),
  );

  return (
    <div className="grid gap-6" dir="rtl">
      <PageHeader
        subtitle="برنامه پایه و تغییرات روزهای خاص همه سرویس‌ها، در یک صفحه"
        title="تقویم و ساعات کاری"
      />
      {toast ? <UrlToast {...toast} /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
        <CalendarRail activeView={activeView} />

        <main className="grid min-w-0 gap-6">
          {activeView === "special-days" ? (
            <>
        <section className="text-card-foreground">
          <div className="mb-5 flex items-start gap-3 border-b pb-4">
            <CalendarCog className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-semibold text-slate-950">ثبت اصلاح جدید</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                «روز عادی» تعطیلی رسمی را نادیده می‌گیرد و برنامه هفتگی هر
                سرویس را اجرا می‌کند؛ استثنای اختصاصی هر سرویس همچنان اولویت
                بالاتری دارد.
              </p>
            </div>
          </div>
          <CalendarOverrideForm buildings={buildings} rooms={rooms} />
        </section>

        <section className="mt-6 grid gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              اصلاح‌های ثبت‌شده
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              هر مورد را باز کنید تا محدوده یا رفتار آن را تغییر دهید.
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            {overrides.length.toLocaleString("fa-IR")} مورد
          </span>
        </div>

        {overrides.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
            هنوز اصلاح مرکزی برای تقویم ثبت نشده است.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {overrides.map((override, index) => {
              const modeDetail = MODE_DETAILS[override.mode];
              const officialHoliday = holidaySources[index];
              const targetTypes = new Set(
                override.targets.map((target) => target.type),
              );
              const targetCount = override.targets.length;

              return (
                <details
                  className="group border-b last:border-b-0"
                  key={override.id}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5">
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-950">
                          {formatJalaliDate(override.date)}
                        </span>
                        <span
                          className={cn(
                            "rounded-md px-2 py-1 text-xs font-medium",
                            modeDetail.className,
                          )}
                        >
                          {modeDetail.label}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs leading-5 text-muted-foreground">
                        {officialHoliday
                          ? `منبع تقویم ایران: ${officialHoliday.title}`
                          : "منبع پایه: برنامه هفتگی"}
                        {override.reason ? ` · ${override.reason}` : ""}
                      </p>
                    </div>
                    <div className="hidden text-left text-xs text-muted-foreground sm:block">
                      <p>{targetCount.toLocaleString("fa-IR")} هدف</p>
                      <p className="mt-1">
                        {[
                          targetTypes.has(CalendarDayTargetType.SYSTEMS) && "سامانه‌ها",
                          targetTypes.has(CalendarDayTargetType.LUNCH) && "غذا",
                          targetTypes.has(CalendarDayTargetType.BUILDING) && "ساختمان‌ها",
                          targetTypes.has(CalendarDayTargetType.MEETING_ROOM) && "اتاق‌ها",
                        ]
                          .filter(Boolean)
                          .join("، ")}
                      </p>
                    </div>
                  </summary>
                  <div className="border-t bg-slate-50/50 p-4 sm:p-5">
                    <CalendarOverrideForm
                      initial={{
                        endTime: override.endTime,
                        lunch: override.targets.some(
                          (target) =>
                            target.type === CalendarDayTargetType.LUNCH &&
                            target.targetKey === GLOBAL_CALENDAR_TARGET_KEY,
                        ),
                        mode: override.mode,
                        buildingIds: override.targets
                          .filter(
                            (target) =>
                              target.type === CalendarDayTargetType.BUILDING &&
                              buildings.some((building) => building.id === target.targetKey),
                          )
                          .map((target) => target.targetKey),
                        overrideId: override.id,
                        reason: override.reason,
                        roomIds: override.targets
                          .filter(
                            (target) =>
                              target.type === CalendarDayTargetType.MEETING_ROOM &&
                              rooms.some((room) => room.id === target.targetKey),
                          )
                          .map((target) => target.targetKey),
                        startTime: override.startTime,
                        systems: override.targets.some(
                          (target) =>
                            target.type === CalendarDayTargetType.SYSTEMS &&
                            target.targetKey === GLOBAL_CALENDAR_TARGET_KEY,
                        ),
                      }}
                      buildings={buildings}
                      rooms={rooms}
                    />
                  </div>
                </details>
              );
            })}
          </div>
        )}

          <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              واردکردن دوباره تقویم رسمی، اصلاح‌های این صفحه را حذف یا بازنویسی
              نمی‌کند.
            </p>
          </div>
        </section>
            </>
          ) : activeView === "weekly" ? (
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
