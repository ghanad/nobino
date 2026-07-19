import "server-only";

import { ReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { cancelLinkedFoodReservationInTransaction } from "@/lib/lunch-service";

import {
  assertManagerOrAdmin,
  ReservationTransitionError,
} from "./shared";

export async function rejectReservation(input: {
  reservationId: string;
  managerId: string;
  rejectionReason?: string;
}) {
  return db.$transaction(async (tx) => {
    await assertManagerOrAdmin(input.managerId, tx);

    const reservation = await tx.reservation.findUnique({
      where: { id: input.reservationId },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });

    if (!reservation) {
      throw new ReservationTransitionError("Reservation was not found.");
    }

    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.ALTERNATIVE_PROPOSED
    ) {
      throw new ReservationTransitionError(
        "Only pending or alternative-proposed reservations can be rejected.",
      );
    }

    const rejectedReservation = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        autoAcceptAt: null,
        status: ReservationStatus.REJECTED,
        rejectionReason: input.rejectionReason?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.managerId,
        entityType: "Reservation",
        entityId: reservation.id,
        action: "RESERVATION_REJECTED",
        oldValue: { status: reservation.status },
        newValue: {
          status: rejectedReservation.status,
          rejectionReason: rejectedReservation.rejectionReason,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: reservation.userId,
        reservationId: reservation.id,
        type: "RESERVATION_REJECTED",
        title: "Reservation rejected",
        body:
          rejectedReservation.rejectionReason ||
          "Your reservation request has been rejected.",
      },
    });

    await cancelLinkedFoodReservationInTransaction({
      sourceReservationId: reservation.id,
      actorUserId: input.managerId,
      client: tx,
    });

    return rejectedReservation;
  });
}
