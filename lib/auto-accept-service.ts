import "server-only";

import {
  runMeetingRoomAutoAcceptBatch,
  type MeetingRoomAutoAcceptRunResult,
} from "@/lib/meeting-room-auto-accept-service";
import {
  runDeskAutoAcceptBatch,
  type DeskAutoAcceptRunResult,
} from "@/lib/desk-auto-accept-service";
import {
  runReservationAutoAcceptBatch,
  type ReservationAutoAcceptRunResult,
} from "@/lib/reservation-auto-accept-service";

export type CombinedAutoAcceptRunResult = {
  desks: DeskAutoAcceptRunResult;
  meetingRooms: MeetingRoomAutoAcceptRunResult;
  reservations: ReservationAutoAcceptRunResult;
  totals: ReservationAutoAcceptRunResult;
};

export async function runAutoAcceptBatch(
  now: Date = new Date(),
): Promise<CombinedAutoAcceptRunResult> {
  const [reservations, meetingRooms, desks] = await Promise.all([
    runReservationAutoAcceptBatch(now),
    runMeetingRoomAutoAcceptBatch(now),
    runDeskAutoAcceptBatch(now),
  ]);

  return {
    desks,
    meetingRooms,
    reservations,
    totals: {
      approved: reservations.approved + meetingRooms.approved + desks.approved,
      considered: reservations.considered + meetingRooms.considered + desks.considered,
      failed: reservations.failed + meetingRooms.failed + desks.failed,
      skipped: reservations.skipped + meetingRooms.skipped + desks.skipped,
      stillPending: reservations.stillPending + meetingRooms.stillPending + desks.stillPending,
    },
  };
}
