import { ReservationStatus } from "@prisma/client";

import { assertCapacityAvailableForApproval } from "@/lib/capacity-service";
import {
  formatDailyUserHourLimitError,
  getReservationPolicy,
  reservationHours,
  endOfLocalDay,
  startOfLocalDay,
} from "@/lib/reservation-service/helpers";

import { ReservationTransitionError, type DbClient } from "./shared";

export async function assertDailyUserReservationPolicy(input: {
  userId: string;
  startAt: Date;
  endAt: Date;
  statuses: ReservationStatus[];
  excludeReservationId?: string;
  allowSingleReservationOverDailyHourLimit?: boolean;
}, client: DbClient): Promise<void> {
  const policy = await getReservationPolicy(client);
  const allowedDailyHours = input.allowSingleReservationOverDailyHourLimit
    ? Math.max(
        policy.dailyUserHourLimit,
        reservationHours(input.startAt, input.endAt),
      )
    : policy.dailyUserHourLimit;
  const dayStart = startOfLocalDay(input.startAt);
  const dayEnd = endOfLocalDay(input.startAt);
  const reservations = await client.reservation.findMany({
    where: {
      userId: input.userId,
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
      status: { in: input.statuses },
      id: input.excludeReservationId
        ? { not: input.excludeReservationId }
        : undefined,
    },
    select: {
      startAt: true,
      endAt: true,
    },
  });

  if (policy.oneReservationPerDayEnabled && reservations.length > 0) {
    throw new ReservationTransitionError(
      "Users can have only one reservation per day.",
    );
  }

  const existingHours = reservations.reduce(
    (total, reservation) =>
      total + reservationHours(reservation.startAt, reservation.endAt),
    0,
  );
  const requestedHours = reservationHours(input.startAt, input.endAt);

  if (existingHours + requestedHours > allowedDailyHours) {
    throw new ReservationTransitionError(
      formatDailyUserHourLimitError(policy.dailyUserHourLimit),
    );
  }
}

export async function assertApprovalPolicies(input: {
  excludeReservationId?: string;
  endAt: Date;
  resourcePoolId: string;
  startAt: Date;
  userId: string;
}, client: DbClient): Promise<void> {
  await assertCapacityAvailableForApproval(
    {
      resourcePoolId: input.resourcePoolId,
      startAt: input.startAt,
      endAt: input.endAt,
      excludeReservationId: input.excludeReservationId,
    },
    client,
  );

  const policy = await getReservationPolicy(client);

  await assertDailyUserReservationPolicy(
    {
      userId: input.userId,
      startAt: input.startAt,
      endAt: input.endAt,
      statuses: [ReservationStatus.APPROVED],
      excludeReservationId: input.excludeReservationId,
      allowSingleReservationOverDailyHourLimit:
        reservationHours(input.startAt, input.endAt) >
        policy.dailyUserHourLimit,
    },
    client,
  );
}
