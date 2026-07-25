import "server-only";

import { ReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { approveDeskReservationInTransaction } from "@/lib/desk-reservation-service";
import { ReservationTransitionError } from "@/lib/reservation-service";

export type DeskAutoAcceptRunResult = {
  approved: number;
  considered: number;
  failed: number;
  skipped: number;
  stillPending: number;
};

function isSkippedAutoAcceptError(error: unknown): boolean {
  return (
    error instanceof ReservationTransitionError &&
    (error.message === "رزرو میز پیدا نشد." ||
      error.message === "فقط درخواست در انتظار بررسی قابل تأیید است.")
  );
}

export async function runDeskAutoAcceptBatch(
  now: Date = new Date(),
): Promise<DeskAutoAcceptRunResult> {
  const eligibleReservations = await db.deskReservation.findMany({
    where: {
      autoApprovalAt: { lte: now },
      endAt: { gt: now },
      status: ReservationStatus.PENDING,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const result: DeskAutoAcceptRunResult = {
    approved: 0,
    considered: eligibleReservations.length,
    failed: 0,
    skipped: 0,
    stillPending: 0,
  };

  for (const reservation of eligibleReservations) {
    try {
      await db.$transaction((tx) =>
        approveDeskReservationInTransaction(tx, {
          actorUserId: null,
          approvedAt: new Date(),
          auditAction: "DESK_RESERVATION_AUTO_APPROVED",
          notificationBody: "درخواست رزرو میز شما به‌صورت خودکار تأیید شد.",
          notificationTitle: "تأیید خودکار رزرو میز",
          notificationType: "DESK_RESERVATION_AUTO_APPROVED",
          reservationId: reservation.id,
        }),
      );
      result.approved += 1;
    } catch (error) {
      if (isSkippedAutoAcceptError(error)) result.skipped += 1;
      else if (error instanceof ReservationTransitionError) result.stillPending += 1;
      else result.failed += 1;
    }
  }

  return result;
}
