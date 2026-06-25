import "server-only";

import { AlternativeStatus, ReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { assertCapacityAvailableForApproval } from "@/lib/capacity-service";
import {
  calculateAutoAcceptAt,
  getReservationPolicy,
} from "@/lib/reservation-service/helpers";
import { validateReservationTimeRange } from "@/lib/schedule";

import { assertDailyUserReservationPolicy } from "./approval-policies";
import {
  assertManagerOrAdmin,
  ReservationTransitionError,
} from "./shared";

export async function proposeAlternative(input: {
  reservationId: string;
  managerId: string;
  proposedStartAt: Date;
  proposedEndAt: Date;
}) {
  return updateReservationTimeByManager(input);
}

export async function updateReservationTimeByManager(input: {
  reservationId: string;
  managerId: string;
  proposedStartAt: Date;
  proposedEndAt: Date;
}) {
  await validateReservationTimeRange({
    startAt: input.proposedStartAt,
    endAt: input.proposedEndAt,
  });

  return db.$transaction(async (tx) => {
    await assertManagerOrAdmin(input.managerId, tx);

    const reservation = await tx.reservation.findUnique({
      where: { id: input.reservationId },
      select: {
        autoAcceptAt: true,
        id: true,
        userId: true,
        resourcePoolId: true,
        startAt: true,
        endAt: true,
        status: true,
      },
    });

    if (!reservation) {
      throw new ReservationTransitionError("Reservation was not found.");
    }

    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.ALTERNATIVE_PROPOSED &&
      reservation.status !== ReservationStatus.APPROVED
    ) {
      throw new ReservationTransitionError(
        "Only active reservations can be updated by a manager.",
      );
    }

    await assertCapacityAvailableForApproval(
      {
        resourcePoolId: reservation.resourcePoolId,
        startAt: input.proposedStartAt,
        endAt: input.proposedEndAt,
        excludeReservationId: reservation.id,
      },
      tx,
    );

    await assertDailyUserReservationPolicy(
      {
        userId: reservation.userId,
        startAt: input.proposedStartAt,
        endAt: input.proposedEndAt,
        statuses: [ReservationStatus.APPROVED],
        excludeReservationId: reservation.id,
        allowSingleReservationOverDailyHourLimit: true,
      },
      tx,
    );

    await tx.reservationAlternative.updateMany({
      where: {
        reservationId: reservation.id,
        status: AlternativeStatus.PROPOSED,
      },
      data: {
        status: AlternativeStatus.EXPIRED,
        respondedAt: new Date(),
      },
    });

    const policy = await getReservationPolicy(tx);
    const changedAt = new Date();
    const keepsApproval = reservation.status === ReservationStatus.APPROVED;
    const updatedReservation = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        autoAcceptAt: keepsApproval
          ? null
          : calculateAutoAcceptAt({
              createdAt: changedAt,
              policy,
              startAt: input.proposedStartAt,
            }),
        startAt: input.proposedStartAt,
        endAt: input.proposedEndAt,
        status: keepsApproval
          ? ReservationStatus.APPROVED
          : ReservationStatus.PENDING,
        approvedById: keepsApproval ? undefined : null,
        approvedAt: keepsApproval ? undefined : null,
        rejectionReason: null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.managerId,
        entityType: "Reservation",
        entityId: reservation.id,
        action: "RESERVATION_TIME_UPDATED",
        oldValue: {
          autoAcceptAt: reservation.autoAcceptAt?.toISOString() ?? null,
          status: reservation.status,
          startAt: reservation.startAt.toISOString(),
          endAt: reservation.endAt.toISOString(),
        },
        newValue: {
          autoAcceptAt: updatedReservation.autoAcceptAt?.toISOString() ?? null,
          status: updatedReservation.status,
          startAt: updatedReservation.startAt.toISOString(),
          endAt: updatedReservation.endAt.toISOString(),
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: reservation.userId,
        reservationId: reservation.id,
        type: "RESERVATION_TIME_UPDATED",
        title: "زمان رزرو تغییر کرد",
        body: keepsApproval
          ? "A manager changed the time for your approved reservation."
          : "A manager changed the time for your pending reservation.",
      },
    });

    return updatedReservation;
  });
}
