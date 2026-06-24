import "server-only";

import { ReservationStatus } from "@prisma/client";

import { CapacityUnavailableError } from "@/lib/capacity-service";
import { db } from "@/lib/db";
import {
  approveReservationInTransaction,
  ReservationTransitionError,
} from "@/lib/reservation-service";

export type ReservationAutoAcceptRunResult = {
  approved: number;
  considered: number;
  failed: number;
  skipped: number;
  stillPending: number;
};

function isSkippedAutoAcceptError(error: unknown): boolean {
  return (
    error instanceof ReservationTransitionError &&
    (error.message === "Reservation was not found." ||
      error.message ===
        "Only pending or alternative-proposed reservations can be approved.")
  );
}

export async function runReservationAutoAcceptBatch(
  now: Date = new Date(),
): Promise<ReservationAutoAcceptRunResult> {
  const eligibleReservations = await db.reservation.findMany({
    where: {
      autoAcceptAt: { lte: now },
      endAt: { gt: now },
      status: ReservationStatus.PENDING,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      autoAcceptAt: true,
      createdAt: true,
    },
  });

  const result: ReservationAutoAcceptRunResult = {
    approved: 0,
    considered: eligibleReservations.length,
    failed: 0,
    skipped: 0,
    stillPending: 0,
  };

  for (const reservation of eligibleReservations) {
    try {
      await db.$transaction(async (tx) => {
        await approveReservationInTransaction(tx, {
          actorUserId: null,
          approvedAt: new Date(),
          approvedById: null,
          auditAction: "RESERVATION_AUTO_APPROVED",
          notificationBody: "Your reservation request was automatically approved.",
          notificationTitle: "Reservation auto-approved",
          notificationType: "RESERVATION_AUTO_APPROVED",
          reservationId: reservation.id,
        });
      });

      result.approved += 1;
    } catch (error) {
      if (error instanceof CapacityUnavailableError) {
        result.stillPending += 1;
        continue;
      }

      if (isSkippedAutoAcceptError(error)) {
        result.skipped += 1;
        continue;
      }

      if (error instanceof ReservationTransitionError) {
        result.stillPending += 1;
        continue;
      }

      result.failed += 1;
    }
  }

  return result;
}
