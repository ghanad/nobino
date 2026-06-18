import { ReservationStatus, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";

type DbClient = typeof db | Prisma.TransactionClient;

const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_DAILY_USER_HOUR_LIMIT = 3;
const DEFAULT_ONE_RESERVATION_PER_DAY_ENABLED = true;
const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR", {
  useGrouping: false,
});

export const ACTIVE_REQUEST_STATUSES = [
  ReservationStatus.PENDING,
  ReservationStatus.APPROVED,
  ReservationStatus.ALTERNATIVE_PROPOSED,
];

export type ReservationPolicy = {
  dailyUserHourLimit: number;
  oneReservationPerDayEnabled: boolean;
};

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

export function endOfLocalDay(date: Date): Date {
  const dayStart = startOfLocalDay(date);

  return new Date(dayStart.getTime() + 24 * ONE_HOUR_MS);
}

export function reservationHours(startAt: Date, endAt: Date): number {
  return (endAt.getTime() - startAt.getTime()) / ONE_HOUR_MS;
}

export async function getReservationPolicy(
  client: DbClient,
): Promise<ReservationPolicy> {
  const policy = await client.reservationPolicy.findUnique({
    where: { id: "default" },
    select: {
      dailyUserHourLimit: true,
      oneReservationPerDayEnabled: true,
    },
  });

  return {
    dailyUserHourLimit:
      policy?.dailyUserHourLimit ?? DEFAULT_DAILY_USER_HOUR_LIMIT,
    oneReservationPerDayEnabled:
      policy?.oneReservationPerDayEnabled ??
      DEFAULT_ONE_RESERVATION_PER_DAY_ENABLED,
  };
}

export function formatDailyUserHourLimitError(limitHours: number): string {
  return `هر کاربر حداکثر می‌تواند ${PERSIAN_NUMBER_FORMATTER.format(
    limitHours,
  )} ساعت در یک روز رزرو کند.`;
}
