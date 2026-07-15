import "server-only";

import { ReservationStatus } from "@prisma/client";

import { CapacityUnavailableError } from "@/lib/capacity-service";
import { db } from "@/lib/db";
import { approveMeetingRoomReservationInTransaction } from "@/lib/meeting-room-reservation-service";
import { ReservationTransitionError } from "@/lib/reservation-service";

export type MeetingRoomAutoAcceptRunResult = {
  approved: number;
  considered: number;
  failed: number;
  skipped: number;
  stillPending: number;
};

function isSkippedAutoAcceptError(error: unknown): boolean {
  return (
    error instanceof ReservationTransitionError &&
    (error.message === "Meeting room reservation was not found." ||
      error.message ===
        "Only pending meeting room reservations can be approved.")
  );
}

export async function runMeetingRoomAutoAcceptBatch(
  now: Date = new Date(),
): Promise<MeetingRoomAutoAcceptRunResult> {
  const eligibleReservations = await db.meetingRoomReservation.findMany({
    where: {
      autoApprovalAt: { lte: now },
      endAt: { gt: now },
      status: ReservationStatus.PENDING,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
    },
  });

  const result: MeetingRoomAutoAcceptRunResult = {
    approved: 0,
    considered: eligibleReservations.length,
    failed: 0,
    skipped: 0,
    stillPending: 0,
  };

  for (const reservation of eligibleReservations) {
    try {
      await db.$transaction(async (tx) => {
        await approveMeetingRoomReservationInTransaction(tx, {
          actorUserId: null,
          approvedAt: new Date(),
          approvedById: null,
          auditAction: "MEETING_ROOM_RESERVATION_AUTO_APPROVED",
          notificationBody: "درخواست رزرو اتاق جلسه شما به صورت خودکار تایید شد.",
          notificationTitle: "رزرو اتاق جلسه تایید شد",
          notificationType: "MEETING_ROOM_RESERVATION_AUTO_APPROVED",
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
