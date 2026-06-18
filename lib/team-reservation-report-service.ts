import "server-only";

import { ReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";
import {
  formatJalaliDateParam,
  formatJalaliDateWithoutWeekday,
  getJalaliDisplayParts,
  parseJalaliDateParam,
} from "@/lib/jalali-date";

export type TeamReservationReportPeriod = "week" | "month";

export type TeamReservationReportTeam = {
  approvedHours: number;
  averageHoursPerMember: number;
  memberCount: number;
  name: string;
  reservationCount: number;
  reservingUserCount: number;
};

export type TeamReservationReport = {
  dateParam: string;
  nextDateParam: string;
  period: TeamReservationReportPeriod;
  previousDateParam: string;
  rangeLabel: string;
  teams: TeamReservationReportTeam[];
  todayDateParam: string;
  totalApprovedHours: number;
  totalApprovedReservationCount: number;
  totalAttributedHours: number;
  totalReservingUsers: number;
};

type ReportRange = {
  dateParam: string;
  endExclusive: Date;
  nextDateParam: string;
  previousDateParam: string;
  rangeLabel: string;
  startAt: Date;
};

type AggregateBucket = {
  approvedHours: number;
  memberCount: number;
  name: string;
  reservationCount: number;
  reservingUserIds: Set<string>;
};

const UNASSIGNED_TEAM_LABEL = "بدون تیم";

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
  period: TeamReservationReportPeriod,
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

function createBucket(name: string, memberCount: number): AggregateBucket {
  return {
    approvedHours: 0,
    memberCount,
    name,
    reservationCount: 0,
    reservingUserIds: new Set<string>(),
  };
}

export async function getTeamReservationReport(input?: {
  date?: string;
  period?: string;
}): Promise<TeamReservationReport> {
  const period: TeamReservationReportPeriod =
    input?.period === "week" ? "week" : "month";
  const requestedDate = parseJalaliDateParam(input?.date) ?? new Date();
  const range = resolveRange(period, requestedDate);
  const today = resolveRange(period, new Date());

  const [teams, reservations] = await Promise.all([
    db.team.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { members: true } },
      },
    }),
    db.reservation.findMany({
      where: {
        status: ReservationStatus.APPROVED,
        startAt: {
          gte: range.startAt,
          lt: range.endExclusive,
        },
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        userId: true,
        user: {
          select: {
            teamMemberships: {
              select: {
                teamId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const buckets = new Map<string, AggregateBucket>(
    teams.map((team) => [
      team.id,
      createBucket(team.name, team._count.members),
    ]),
  );

  let totalApprovedHours = 0;
  const totalReservingUserIds = new Set<string>();
  let unassignedBucket: AggregateBucket | null = null;

  for (const reservation of reservations) {
    const durationHours = getDurationHours(reservation.startAt, reservation.endAt);
    const teamIds = reservation.user.teamMemberships.map((membership) => membership.teamId);

    totalApprovedHours += durationHours;
    totalReservingUserIds.add(reservation.userId);

    if (teamIds.length === 0) {
      unassignedBucket ??= createBucket(UNASSIGNED_TEAM_LABEL, 0);
      unassignedBucket.approvedHours += durationHours;
      unassignedBucket.reservationCount += 1;
      unassignedBucket.reservingUserIds.add(reservation.userId);
      continue;
    }

    for (const teamId of teamIds) {
      const bucket = buckets.get(teamId);

      if (!bucket) {
        continue;
      }

      bucket.approvedHours += durationHours;
      bucket.reservationCount += 1;
      bucket.reservingUserIds.add(reservation.userId);
    }
  }

  const teamRows = Array.from(buckets.values());

  if (unassignedBucket) {
    teamRows.push(unassignedBucket);
  }

  const normalizedTeams = teamRows
    .map((team) => ({
      approvedHours: team.approvedHours,
      averageHoursPerMember:
        team.memberCount > 0 ? team.approvedHours / team.memberCount : 0,
      memberCount: team.memberCount,
      name: team.name,
      reservationCount: team.reservationCount,
      reservingUserCount: team.reservingUserIds.size,
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
    teams: normalizedTeams,
    todayDateParam: today.dateParam,
    totalApprovedHours,
    totalApprovedReservationCount: reservations.length,
    totalAttributedHours: normalizedTeams.reduce(
      (sum, team) => sum + team.approvedHours,
      0,
    ),
    totalReservingUsers: totalReservingUserIds.size,
  };
}

export function formatTeamReportRangeForCaption(report: TeamReservationReport): string {
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
