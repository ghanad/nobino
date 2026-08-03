import {
  CalendarDayOverrideMode,
  CalendarDayTargetType,
} from "@prisma/client";

import {
  getCalendarDayOverride,
  GLOBAL_CALENDAR_TARGET_KEY,
} from "@/lib/calendar-day-override-service";
import { db } from "@/lib/db";
import { getIranHolidayForDate } from "@/lib/iran-holidays";

const ONE_HOUR_MS = 60 * 60 * 1000;

export type WorkingWindow = {
  isWorkingDay: boolean;
  reason: string | null;
  startTime: string | null;
  endTime: string | null;
};

export class ReservationTimeRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationTimeRangeError";
  }
}

function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

function endOfLocalDay(date: Date): Date {
  const dayStart = startOfLocalDay(date);

  return new Date(dayStart.getTime() + 24 * ONE_HOUR_MS);
}

function isSameLocalCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ReservationTimeRangeError(`${fieldName} must be a valid date.`);
  }
}

function isOnHourlyBoundary(date: Date): boolean {
  return (
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}

function parseTimeToMinutes(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesSinceLocalMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function assertWorkingWindowIsConfigured(window: WorkingWindow): {
  startMinutes: number;
  endMinutes: number;
} {
  const startMinutes = parseTimeToMinutes(window.startTime);
  const endMinutes = parseTimeToMinutes(window.endTime);

  if (
    startMinutes === null ||
    endMinutes === null ||
    endMinutes <= startMinutes
  ) {
    throw new ReservationTimeRangeError(
      "Working hours are not configured for this date.",
    );
  }

  return { startMinutes, endMinutes };
}

export async function getWorkingWindowForDate(
  date: Date,
): Promise<WorkingWindow> {
  assertValidDate(date, "date");

  const exception = await db.scheduleException.findFirst({
    where: {
      date: {
        gte: startOfLocalDay(date),
        lt: endOfLocalDay(date),
      },
    },
    select: {
      isWorkingDay: true,
      reason: true,
      startTime: true,
      endTime: true,
    },
  });

  if (exception) {
    return {
      isWorkingDay: exception.isWorkingDay,
      reason: exception.reason,
      startTime: exception.startTime,
      endTime: exception.endTime,
    };
  }

  const calendarOverride = await getCalendarDayOverride({
    date,
    targetKey: GLOBAL_CALENDAR_TARGET_KEY,
    type: CalendarDayTargetType.SYSTEMS,
  });

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

  const officialHoliday =
    calendarOverride?.mode === CalendarDayOverrideMode.NORMAL
      ? null
      : await getIranHolidayForDate(date);

  if (officialHoliday) {
    return {
      isWorkingDay: false,
      reason: officialHoliday.title,
      startTime: null,
      endTime: null,
    };
  }

  const weeklySchedule = await db.workingSchedule.findUnique({
    where: { dayOfWeek: date.getDay() },
    select: {
      isWorkingDay: true,
      startTime: true,
      endTime: true,
    },
  });

  if (!weeklySchedule) {
    return {
      isWorkingDay: false,
      reason: null,
      startTime: null,
      endTime: null,
    };
  }

  return {
    ...weeklySchedule,
    reason: null,
  };
}

export async function validateReservationTimeRange(input: {
  startAt: Date;
  endAt: Date;
}): Promise<void> {
  const { startAt, endAt } = input;

  assertValidDate(startAt, "startAt");
  assertValidDate(endAt, "endAt");

  if (!isOnHourlyBoundary(startAt) || !isOnHourlyBoundary(endAt)) {
    throw new ReservationTimeRangeError(
      "Reservations must start and end on exact hourly boundaries.",
    );
  }

  if (!isSameLocalCalendarDay(startAt, endAt)) {
    throw new ReservationTimeRangeError(
      "Reservations cannot span multiple calendar days.",
    );
  }

  const durationMs = endAt.getTime() - startAt.getTime();

  if (startAt.getTime() < Date.now()) {
    throw new ReservationTimeRangeError(
      "Reservation start time cannot be in the past.",
    );
  }

  if (durationMs < ONE_HOUR_MS) {
    throw new ReservationTimeRangeError(
      "Reservations must be at least 1 hour long.",
    );
  }

  const workingWindow = await getWorkingWindowForDate(startAt);

  if (!workingWindow.isWorkingDay) {
    throw new ReservationTimeRangeError("This date is not a working day.");
  }

  const { startMinutes, endMinutes } =
    assertWorkingWindowIsConfigured(workingWindow);
  const reservationStartMinutes = minutesSinceLocalMidnight(startAt);
  const reservationEndMinutes = minutesSinceLocalMidnight(endAt);

  if (
    reservationStartMinutes < startMinutes ||
    reservationEndMinutes > endMinutes
  ) {
    throw new ReservationTimeRangeError(
      "Reservation time must be inside configured working hours.",
    );
  }

  const workingDayDurationMs = (endMinutes - startMinutes) * 60 * 1000;

  if (durationMs > workingDayDurationMs) {
    throw new ReservationTimeRangeError(
      "Reservations cannot be longer than one working day.",
    );
  }
}
