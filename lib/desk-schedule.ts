import "server-only";

import {
  CalendarDayOverrideMode,
  CalendarDayTargetType,
  type Prisma,
} from "@prisma/client";

import { getCalendarDayOverride } from "@/lib/calendar-day-override-service";
import { db } from "@/lib/db";
import { getIranHolidayForDate } from "@/lib/iran-holidays";
import { ReservationTimeRangeError, type WorkingWindow } from "@/lib/schedule";

const ONE_HOUR_MS = 60 * 60 * 1000;

type DbClient = typeof db | Prisma.TransactionClient;

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(date: Date): Date {
  const end = startOfLocalDay(date);
  end.setDate(end.getDate() + 1);
  return end;
}

function parseTime(value: string | null): number | null {
  if (!value || !/^([01]\d|2[0-3]):00$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60;
}

export async function getOfficeWorkingWindowForDate(
  input: { officeId: string; date: Date },
  client: DbClient = db,
): Promise<WorkingWindow> {
  const exception = await client.officeScheduleException.findFirst({
    where: {
      officeId: input.officeId,
      date: { gte: startOfLocalDay(input.date), lt: endOfLocalDay(input.date) },
    },
    select: { endTime: true, isWorkingDay: true, reason: true, startTime: true },
  });

  if (exception) return exception;

  const calendarOverride = await getCalendarDayOverride(
    {
      date: input.date,
      targetKey: input.officeId,
      type: CalendarDayTargetType.OFFICE,
    },
    client,
  );

  if (calendarOverride?.mode === CalendarDayOverrideMode.CLOSED) {
    return {
      isWorkingDay: false,
      reason: calendarOverride.reason,
      startTime: null,
      endTime: null,
    };
  }

  if (calendarOverride?.mode === CalendarDayOverrideMode.CUSTOM) {
    return {
      isWorkingDay: true,
      reason: calendarOverride.reason,
      startTime: calendarOverride.startTime,
      endTime: calendarOverride.endTime,
    };
  }

  const holiday =
    calendarOverride?.mode === CalendarDayOverrideMode.NORMAL
      ? null
      : await getIranHolidayForDate(input.date);
  if (holiday) {
    return { isWorkingDay: false, reason: holiday.title, startTime: null, endTime: null };
  }

  const schedule = await client.officeWeeklySchedule.findUnique({
    where: {
      officeId_dayOfWeek: { officeId: input.officeId, dayOfWeek: input.date.getDay() },
    },
    select: { endTime: true, isWorkingDay: true, startTime: true },
  });

  return schedule ? { ...schedule, reason: null } : {
    isWorkingDay: false,
    reason: null,
    startTime: null,
    endTime: null,
  };
}

export async function validateDeskReservationTimeRange(
  input: {
    allowPastStart?: boolean;
    deskId: string;
    endAt: Date;
    startAt: Date;
  },
  client: DbClient = db,
): Promise<void> {
  const { endAt, startAt } = input;
  if (
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(endAt.getTime()) ||
    startAt.getMinutes() !== 0 ||
    endAt.getMinutes() !== 0 ||
    startAt.getSeconds() !== 0 ||
    endAt.getSeconds() !== 0
  ) {
    throw new ReservationTimeRangeError("شروع و پایان رزرو باید روی ساعت کامل باشد.");
  }

  if (
    startAt.getFullYear() !== endAt.getFullYear() ||
    startAt.getMonth() !== endAt.getMonth() ||
    startAt.getDate() !== endAt.getDate()
  ) {
    throw new ReservationTimeRangeError("رزرو میز نمی‌تواند وارد روز بعد شود.");
  }

  if (!input.allowPastStart && startAt.getTime() < Date.now()) {
    throw new ReservationTimeRangeError("ساعت شروع رزرو نمی‌تواند در گذشته باشد.");
  }

  if (endAt.getTime() - startAt.getTime() < ONE_HOUR_MS) {
    throw new ReservationTimeRangeError("مدت رزرو میز باید حداقل یک ساعت باشد.");
  }

  const desk = await client.desk.findUnique({
    where: { id: input.deskId },
    select: {
      active: true,
      office: { select: { active: true, deletedAt: true, id: true } },
    },
  });
  if (!desk?.active || !desk.office.active || desk.office.deletedAt) {
    throw new ReservationTimeRangeError("این میز در دسترس نیست.");
  }

  const window = await getOfficeWorkingWindowForDate(
    { officeId: desk.office.id, date: startAt },
    client,
  );
  if (!window.isWorkingDay) {
    throw new ReservationTimeRangeError("دفتر در این تاریخ فعال نیست.");
  }

  const startMinutes = parseTime(window.startTime);
  const endMinutes = parseTime(window.endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    throw new ReservationTimeRangeError("ساعات کاری این دفتر معتبر تنظیم نشده است.");
  }

  const requestedStart = startAt.getHours() * 60;
  const requestedEnd = endAt.getHours() * 60;
  if (requestedStart < startMinutes || requestedEnd > endMinutes) {
    throw new ReservationTimeRangeError("زمان رزرو باید داخل ساعات کاری دفتر باشد.");
  }
}
