import "server-only";

import { ReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";
import {
  formatJalaliDateParam,
  formatJalaliDateWithoutWeekday,
  getJalaliDisplayParts,
  parseJalaliDateParam,
} from "@/lib/jalali-date";

export type UserReservationReportPeriod = "week" | "month";

export type UserReservationReportUser = {
  approvedHours: number;
  id: string;
  name: string;
  reservationCount: number;
  teamNames: string[];
};

export type UserReservationReport = {
  dateParam: string;
  nextDateParam: string;
  period: UserReservationReportPeriod;
  previousDateParam: string;
  rangeLabel: string;
  todayDateParam: string;
  totalApprovedHours: number;
  totalApprovedReservationCount: number;
  totalReservingUsers: number;
  users: UserReservationReportUser[];
};

type ReportRange = {
  dateParam: string;
  endExclusive: Date;
  nextDateParam: string;
  previousDateParam: string;
  rangeLabel: string;
  startAt: Date;
};

type UserBucket = {
  approvedHours: number;
  name: string;
  reservationCount: number;
  teamNames: Set<string>;
};

const NO_TEAM_LABEL = "بدون تیم";

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

function addLocalDays(date: Date, days: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    0,
    0,
    0,
    0,
  );
}

function getWeekStart(date: Date): Date {
  const normalized = startOfLocalDay(date);
  const daysSinceSaturday = (normalized.getDay() + 1) % 7;

  return addLocalDays(normalized, -daysSinceSaturday);
}

function buildJalaliDateParam(year: number, month: number, day: number): string {
  return [
    year.toString().padStart(4, "0"),
    month.toString().padStart(2, "0"),
    day.toString().padStart(2, "0"),
  ].join("-");
}

function getJalaliMonthStart(date: Date): Date {
  const parts = getJalaliDisplayParts(date);
  const monthStart = parseJalaliDateParam(
    buildJalaliDateParam(parts.year, parts.month, 1),
  );

  if (!monthStart) {
    throw new Error("Failed to resolve Jalali month start.");
  }

  return monthStart;
}

function getNextJalaliMonthStart(date: Date): Date {
  const parts = getJalaliDisplayParts(date);
  const nextMonthYear = parts.month === 12 ? parts.year + 1 : parts.year;
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const nextMonthStart = parseJalaliDateParam(
    buildJalaliDateParam(nextMonthYear, nextMonth, 1),
  );

  if (!nextMonthStart) {
    throw new Error("Failed to resolve next Jalali month start.");
  }

  return nextMonthStart;
}

function formatWeekRangeLabel(startAt: Date, endExclusive: Date): string {
  const start = getJalaliDisplayParts(startAt);
  const end = getJalaliDisplayParts(addLocalDays(endExclusive, -1));
  const isSameMonth = start.year === end.year && start.month === end.month;
  const isSameYear = start.year === end.year;

  if (isSameMonth) {
    return `${start.dayLabel} تا ${end.dayLabel} ${end.monthLabel} ${end.yearLabel}`;
  }

  if (isSameYear) {
    return `${start.dayLabel} ${start.monthLabel} تا ${end.dayLabel} ${end.monthLabel} ${end.yearLabel}`;
  }

  return `${start.dayLabel} ${start.monthLabel} ${start.yearLabel} تا ${end.dayLabel} ${end.monthLabel} ${end.yearLabel}`;
}

function formatMonthRangeLabel(startAt: Date): string {
  const parts = getJalaliDisplayParts(startAt);

  return `${parts.monthLabel} ${parts.yearLabel}`;
}

function resolveRange(
  period: UserReservationReportPeriod,
  inputDate: Date,
): ReportRange {
  if (period === "week") {
    const startAt = getWeekStart(inputDate);
    const endExclusive = addLocalDays(startAt, 7);

    return {
      dateParam: formatJalaliDateParam(startAt),
      endExclusive,
      nextDateParam: formatJalaliDateParam(addLocalDays(startAt, 7)),
      previousDateParam: formatJalaliDateParam(addLocalDays(startAt, -7)),
      rangeLabel: formatWeekRangeLabel(startAt, endExclusive),
      startAt,
    };
  }

  const startAt = getJalaliMonthStart(inputDate);
  const endExclusive = getNextJalaliMonthStart(startAt);
  const previousMonthAnchor = addLocalDays(startAt, -1);

  return {
    dateParam: formatJalaliDateParam(startAt),
    endExclusive,
    nextDateParam: formatJalaliDateParam(endExclusive),
    previousDateParam: formatJalaliDateParam(getJalaliMonthStart(previousMonthAnchor)),
    rangeLabel: formatMonthRangeLabel(startAt),
    startAt,
  };
}

function getDurationHours(startAt: Date, endAt: Date): number {
  return (endAt.getTime() - startAt.getTime()) / 3_600_000;
}

export async function getUserReservationReport(input?: {
  date?: string;
  period?: string;
}): Promise<UserReservationReport> {
  const period: UserReservationReportPeriod =
    input?.period === "week" ? "week" : "month";
  const requestedDate = parseJalaliDateParam(input?.date) ?? new Date();
  const range = resolveRange(period, requestedDate);
  const today = resolveRange(period, new Date());

  const reservations = await db.reservation.findMany({
    where: {
      status: ReservationStatus.APPROVED,
      startAt: {
        gte: range.startAt,
        lt: range.endExclusive,
      },
    },
    select: {
      endAt: true,
      startAt: true,
      userId: true,
      user: {
        select: {
          name: true,
          teamMemberships: {
            select: {
              team: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const buckets = new Map<string, UserBucket>();
  let totalApprovedHours = 0;

  for (const reservation of reservations) {
    let bucket = buckets.get(reservation.userId);

    if (!bucket) {
      bucket = {
        approvedHours: 0,
        name: reservation.user.name,
        reservationCount: 0,
        teamNames: new Set<string>(),
      };
      buckets.set(reservation.userId, bucket);
    }

    bucket.approvedHours += getDurationHours(
      reservation.startAt,
      reservation.endAt,
    );
    bucket.reservationCount += 1;

    if (reservation.user.teamMemberships.length === 0) {
      bucket.teamNames.add(NO_TEAM_LABEL);
    } else {
      for (const membership of reservation.user.teamMemberships) {
        bucket.teamNames.add(membership.team.name);
      }
    }

    totalApprovedHours += getDurationHours(
      reservation.startAt,
      reservation.endAt,
    );
  }

  const users = Array.from(buckets.entries())
    .map(([userId, bucket]) => ({
      approvedHours: bucket.approvedHours,
      id: userId,
      name: bucket.name,
      reservationCount: bucket.reservationCount,
      teamNames: Array.from(bucket.teamNames).sort((left, right) =>
        left.localeCompare(right, "fa"),
      ),
    }))
    .sort((left, right) => {
      if (right.approvedHours !== left.approvedHours) {
        return right.approvedHours - left.approvedHours;
      }

      return left.name.localeCompare(right.name, "fa");
    });

  return {
    dateParam: range.dateParam,
    nextDateParam: range.nextDateParam,
    period,
    previousDateParam: range.previousDateParam,
    rangeLabel: range.rangeLabel,
    todayDateParam: today.dateParam,
    totalApprovedHours,
    totalApprovedReservationCount: reservations.length,
    totalReservingUsers: users.length,
    users,
  };
}

export function formatUserReportRangeForCaption(
  report: UserReservationReport,
): string {
  if (report.period === "month") {
    return report.rangeLabel;
  }

  const startDate = parseJalaliDateParam(report.dateParam);
  const endDate = startDate ? addLocalDays(startDate, 6) : null;

  if (!startDate || !endDate) {
    return report.rangeLabel;
  }

  return `${formatJalaliDateWithoutWeekday(startDate)} تا ${formatJalaliDateWithoutWeekday(endDate)}`;
}
