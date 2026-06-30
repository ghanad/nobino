import "server-only";

import { type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { getIranHolidayForDate } from "@/lib/iran-holidays";
import {
  ReservationTimeRangeError,
  type WorkingWindow,
} from "@/lib/schedule";

const ONE_HOUR_MS = 60 * 60 * 1000;

type DbClient = typeof db | Prisma.TransactionClient;

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
  return new Date(startOfLocalDay(date).getTime() + 24 * ONE_HOUR_MS);
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
  endMinutes: number;
  startMinutes: number;
} {
  const startMinutes = parseTimeToMinutes(window.startTime);
  const endMinutes = parseTimeToMinutes(window.endTime);

  if (
    startMinutes === null ||
    endMinutes === null ||
    endMinutes <= startMinutes
  ) {
    throw new ReservationTimeRangeError(
      "Working hours are not configured for this meeting room on this date.",
    );
  }

  return { endMinutes, startMinutes };
}

export async function getMeetingRoomWorkingWindowForDate(
  input: {
    roomId: string;
    date: Date;
  },
  client: DbClient = db,
): Promise<WorkingWindow> {
  assertValidDate(input.date, "date");

  const exception = await client.meetingRoomScheduleException.findFirst({
    where: {
      roomId: input.roomId,
      date: {
        gte: startOfLocalDay(input.date),
        lt: endOfLocalDay(input.date),
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

  const officialHoliday = await getIranHolidayForDate(input.date);

  if (officialHoliday) {
    return {
      isWorkingDay: false,
      reason: officialHoliday.title,
      startTime: null,
      endTime: null,
    };
  }

  const weeklySchedule = await client.meetingRoomWeeklySchedule.findUnique({
    where: {
      roomId_dayOfWeek: {
        roomId: input.roomId,
        dayOfWeek: input.date.getDay(),
      },
    },
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

export async function validateMeetingRoomReservationTimeRange(
  input: {
    roomId: string;
    startAt: Date;
    endAt: Date;
  },
  client: DbClient = db,
): Promise<void> {
  const { endAt, startAt } = input;

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

  const room = await client.meetingRoom.findUnique({
    where: { id: input.roomId },
    select: { isActive: true },
  });

  if (!room?.isActive) {
    throw new ReservationTimeRangeError("Meeting room is not available.");
  }

  const workingWindow = await getMeetingRoomWorkingWindowForDate(
    { roomId: input.roomId, date: startAt },
    client,
  );

  if (!workingWindow.isWorkingDay) {
    throw new ReservationTimeRangeError(
      "This date is not available for this meeting room.",
    );
  }

  const { endMinutes, startMinutes } =
    assertWorkingWindowIsConfigured(workingWindow);
  const reservationStartMinutes = minutesSinceLocalMidnight(startAt);
  const reservationEndMinutes = minutesSinceLocalMidnight(endAt);

  if (
    reservationStartMinutes < startMinutes ||
    reservationEndMinutes > endMinutes
  ) {
    throw new ReservationTimeRangeError(
      "Reservation time must be inside configured meeting room hours.",
    );
  }

  const workingDayDurationMs = (endMinutes - startMinutes) * 60 * 1000;

  if (durationMs > workingDayDurationMs) {
    throw new ReservationTimeRangeError(
      "Reservations cannot be longer than one working day.",
    );
  }
}
