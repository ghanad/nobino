import "server-only";

import { LunchReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";
import {
  formatJalaliDate,
  formatJalaliDateParam,
  formatJalaliDateWithoutWeekday,
} from "@/lib/jalali-date";

export type LunchReportReservation = {
  id: string;
  userName: string;
};

export type LunchReportLocation = {
  id: string;
  name: string;
  reservations: LunchReportReservation[];
};

export type LunchReportQuickDay = {
  dateParam: string;
  fullLabel: string;
  isSelected: boolean;
  isToday: boolean;
  shortLabel: string;
  weekdayLabel: string;
};

export type LunchReportData = {
  activeReservationCount: number;
  dateLabel: string;
  dateParam: string;
  locations: LunchReportLocation[];
  nextDateParam: string;
  previousDateParam: string;
  quickDays: LunchReportQuickDay[];
  todayDateParam: string;
};

export function addLocalDays(date: Date, days: number): Date {
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

export function startOfLocalDay(date: Date): Date {
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

function getJalaliWeekday(date: Date): string {
  return formatJalaliDate(date).split(" ").slice(0, 2).join(" ");
}

export async function getLunchReportForDate(date: Date): Promise<LunchReportData> {
  const reportDay = startOfLocalDay(date);
  const today = startOfLocalDay(new Date());
  const [locations, reportReservations] = await Promise.all([
    db.lunchLocation.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.lunchReservation.findMany({
      where: {
        date: reportDay,
        status: LunchReservationStatus.ACTIVE,
      },
      orderBy: [{ location: { name: "asc" } }, { user: { name: "asc" } }],
      select: {
        id: true,
        locationId: true,
        user: { select: { name: true } },
      },
    }),
  ]);
  const reportDateParam = formatJalaliDateParam(reportDay);
  const groupedReport = reportReservations.reduce(
    (groups, reservation) => {
      const key = reservation.locationId;
      const current = groups.get(key) ?? [];
      current.push({
        id: reservation.id,
        userName: reservation.user.name,
      });
      groups.set(key, current);

      return groups;
    },
    new Map<string, LunchReportReservation[]>(),
  );

  return {
    activeReservationCount: reportReservations.length,
    dateLabel: formatJalaliDate(reportDay),
    dateParam: reportDateParam,
    locations: locations.map((location) => ({
      ...location,
      reservations: groupedReport.get(location.id) ?? [],
    })),
    nextDateParam: formatJalaliDateParam(addLocalDays(reportDay, 1)),
    previousDateParam: formatJalaliDateParam(addLocalDays(reportDay, -1)),
    quickDays: Array.from({ length: 7 }, (_, index) => {
      const quickDay = addLocalDays(reportDay, index - 3);
      const dateParam = formatJalaliDateParam(quickDay);

      return {
        dateParam,
        fullLabel: formatJalaliDate(quickDay),
        isSelected: dateParam === reportDateParam,
        isToday: quickDay.getTime() === today.getTime(),
        shortLabel: formatJalaliDateWithoutWeekday(quickDay),
        weekdayLabel: getJalaliWeekday(quickDay),
      };
    }),
    todayDateParam: formatJalaliDateParam(today),
  };
}
