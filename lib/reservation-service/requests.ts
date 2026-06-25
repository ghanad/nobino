import { ReservationStatus, UserRole } from "@prisma/client";

import { db } from "@/lib/db";
import {
  calculateAutoAcceptAt,
  getReservationPolicy,
  ACTIVE_REQUEST_STATUSES,
} from "@/lib/reservation-service/helpers";
import { validateReservationTimeRange } from "@/lib/schedule";

import {
  assertDailyUserReservationPolicy,
} from "./approval-policies";
import { ReservationTransitionError } from "./shared";

export async function createReservationRequest(input: {
  userId: string;
  resourcePoolId: string;
  startAt: Date;
  endAt: Date;
  partySize?: number;
  reason?: string;
}) {
  const partySize = input.partySize ?? 1;

  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
    throw new ReservationTransitionError(
      "Reservation people count must be between 1 and 20.",
    );
  }

  await validateReservationTimeRange({
    startAt: input.startAt,
    endAt: input.endAt,
  });

  return db.$transaction(async (tx) => {
    await assertDailyUserReservationPolicy(
      {
        userId: input.userId,
        startAt: input.startAt,
        endAt: input.endAt,
        statuses: ACTIVE_REQUEST_STATUSES,
      },
      tx,
    );

    const policy = await getReservationPolicy(tx);
    const createdAt = new Date();
    const autoAcceptAt = calculateAutoAcceptAt({
      createdAt,
      policy,
      startAt: input.startAt,
    });

    const reservation = await tx.reservation.create({
      data: {
        autoAcceptAt,
        createdAt,
        endAt: input.endAt,
        partySize,
        reason: input.reason?.trim() || null,
        userId: input.userId,
        resourcePoolId: input.resourcePoolId,
        startAt: input.startAt,
        status: ReservationStatus.PENDING,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "Reservation",
        entityId: reservation.id,
        action: "RESERVATION_CREATED",
        newValue: {
          autoAcceptAt: reservation.autoAcceptAt?.toISOString() ?? null,
          createdAt: reservation.createdAt.toISOString(),
          userId: reservation.userId,
          resourcePoolId: reservation.resourcePoolId,
          startAt: reservation.startAt.toISOString(),
          endAt: reservation.endAt.toISOString(),
          partySize: reservation.partySize,
          status: reservation.status,
          reason: reservation.reason,
        },
      },
    });

    const managers = await tx.user.findMany({
      where: {
        active: true,
        role: { in: [UserRole.MANAGER, UserRole.ADMIN] },
      },
      select: { id: true },
    });

    if (managers.length > 0) {
      await tx.notification.createMany({
        data: managers.map((manager) => ({
          userId: manager.id,
          reservationId: reservation.id,
          type: "NEW_PENDING_RESERVATION",
          title: "New pending reservation",
          body: "A reservation request is waiting for review.",
        })),
      });
    }

    return reservation;
  });
}
