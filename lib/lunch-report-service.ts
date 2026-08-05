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
  breakfastReserved: boolean;
  lunchReserved: boolean;
};

export type LunchReportLocation = {
  id: string;
  name: string;
  reservations: LunchReportReservation[];
  breakfastCount: number;
  lunchCount: number;
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
  breakfastCount: number;
  dateLabel: string;
  dateParam: string;
  locations: LunchReportLocation[];
  lunchCount: number;
  nextDateParam: string;
  previousDateParam: string;
  quickDays: LunchReportQuickDay[];
  todayDateParam: string;
};

export type LunchReportSummaryLocation = {
  id: string;
  name: string;
  breakfastCount: number;
  breakfastUserNames: string[];
  lunchCount: number;
  lunchUserNames: string[];
};

export type LunchReportSummary = {
  date: Date;
  dateLabel: string;
  dateParam: string;
  breakfastCount: number;
  lunchCount: number;
  totalCount: number;
  locations: LunchReportSummaryLocation[];
};

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

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

type ReportReservationRecord = {
  id: string;
  locationId: string;
  breakfastReserved: boolean;
  lunchReserved: boolean;
  location: {
    id: string;
    name: string;
    active: boolean;
  };
  user: {
    name: string;
  };
};

async function getLunchReportRecords(reportDay: Date): Promise<{
  activeLocations: Array<{ id: string; name: string }>;
  reservations: ReportReservationRecord[];
}> {
  const [activeLocations, reservations] = await Promise.all([
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
        breakfastReserved: true,
        lunchReserved: true,
        location: {
          select: {
            id: true,
            name: true,
            active: true,
          },
        },
        user: { select: { name: true } },
      },
    }),
  ]);

  return { activeLocations, reservations };
}

function getSummaryLocations(input: {
  activeLocations: Array<{ id: string; name: string }>;
  reservations: ReportReservationRecord[];
}): LunchReportSummaryLocation[] {
  const countByLocationId = new Map<
    string,
    { breakfastCount: number; lunchCount: number }
  >();
  const locationById = new Map(
    input.activeLocations.map((location) => [location.id, location]),
  );

  for (const reservation of input.reservations) {
    const current = countByLocationId.get(reservation.locationId) ?? {
      breakfastCount: 0,
      lunchCount: 0,
    };
    countByLocationId.set(reservation.locationId, {
      breakfastCount:
        current.breakfastCount + (reservation.breakfastReserved ? 1 : 0),
      lunchCount: current.lunchCount + (reservation.lunchReserved ? 1 : 0),
    });

    if (!locationById.has(reservation.locationId)) {
      locationById.set(reservation.locationId, {
        id: reservation.location.id,
        name: reservation.location.name,
      });
    }
  }

  return Array.from(locationById.values())
    .sort((left, right) => left.name.localeCompare(right.name, "fa"))
    .map((location) => ({
      ...location,
      breakfastCount:
        countByLocationId.get(location.id)?.breakfastCount ?? 0,
      breakfastUserNames: input.reservations
        .filter(
          (reservation) =>
            reservation.locationId === location.id &&
            reservation.breakfastReserved,
        )
        .map((reservation) => reservation.user.name),
      lunchCount: countByLocationId.get(location.id)?.lunchCount ?? 0,
      lunchUserNames: input.reservations
        .filter(
          (reservation) =>
            reservation.locationId === location.id && reservation.lunchReserved,
        )
        .map((reservation) => reservation.user.name),
    }));
}

function getJalaliWeekday(date: Date): string {
  return formatJalaliDate(date).split(" ").slice(0, 2).join(" ");
}

export async function getLunchReportForDate(date: Date): Promise<LunchReportData> {
  const reportDay = startOfLocalDay(date);
  const today = startOfLocalDay(new Date());
  const { activeLocations, reservations: reportReservations } =
    await getLunchReportRecords(reportDay);
  const locations = getSummaryLocations({
    activeLocations,
    reservations: reportReservations,
  });
  const reportDateParam = formatJalaliDateParam(reportDay);
  const groupedReport = reportReservations.reduce(
    (groups, reservation) => {
      const key = reservation.locationId;
      const current = groups.get(key) ?? [];
      current.push({
        id: reservation.id,
        userName: reservation.user.name,
        breakfastReserved: reservation.breakfastReserved,
        lunchReserved: reservation.lunchReserved,
      });
      groups.set(key, current);

      return groups;
    },
    new Map<string, LunchReportReservation[]>(),
  );

  return {
    activeReservationCount: reportReservations.length,
    breakfastCount: reportReservations.filter(
      (reservation) => reservation.breakfastReserved,
    ).length,
    dateLabel: formatJalaliDate(reportDay),
    dateParam: reportDateParam,
    locations: locations.map((location) => ({
      ...location,
      reservations: groupedReport.get(location.id) ?? [],
    })),
    lunchCount: reportReservations.filter(
      (reservation) => reservation.lunchReserved,
    ).length,
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

export async function getLunchReportSummary(date: Date): Promise<LunchReportSummary> {
  const reportDay = startOfLocalDay(date);
  const { activeLocations, reservations } = await getLunchReportRecords(reportDay);
  const locations = getSummaryLocations({ activeLocations, reservations });

  return {
    date: reportDay,
    dateLabel: formatJalaliDate(reportDay),
    dateParam: formatJalaliDateParam(reportDay),
    breakfastCount: reservations.filter(
      (reservation) => reservation.breakfastReserved,
    ).length,
    lunchCount: reservations.filter((reservation) => reservation.lunchReserved)
      .length,
    totalCount: reservations.reduce(
      (total, reservation) =>
        total +
        (reservation.breakfastReserved ? 1 : 0) +
        (reservation.lunchReserved ? 1 : 0),
      0,
    ),
    locations,
  };
}

function formatNameLines(label: string, names: string[]): string[] {
  if (names.length === 0) {
    return [];
  }

  return [`اسامی ${label}:`, ...names.map((name) => `• ${name}`)];
}

export function formatLunchReportMessage(
  summary: LunchReportSummary,
  options?: {
    includeBreakfastNames?: boolean;
    includeLunchNames?: boolean;
  },
): string {
  const lines = [
    "گزارش غذا",
    `تاریخ: ${summary.dateLabel}`,
    `جمع صبحانه: ${PERSIAN_NUMBER_FORMATTER.format(summary.breakfastCount)}`,
    `جمع ناهار: ${PERSIAN_NUMBER_FORMATTER.format(summary.lunchCount)}`,
    "",
    ...summary.locations.flatMap((location, index) => [
      ...(index > 0 ? [""] : []),
      `${location.name}:`,
      `صبحانه: ${PERSIAN_NUMBER_FORMATTER.format(location.breakfastCount)}`,
      ...(options?.includeBreakfastNames
        ? formatNameLines("صبحانه", location.breakfastUserNames)
        : []),
      `ناهار: ${PERSIAN_NUMBER_FORMATTER.format(location.lunchCount)}`,
      ...(options?.includeLunchNames
        ? formatNameLines("ناهار", location.lunchUserNames)
        : []),
    ]),
  ];

  return lines.join("\n");
}
