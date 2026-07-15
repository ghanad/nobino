import "server-only";

import {
  runMeetingRoomAutoAcceptBatch,
  type MeetingRoomAutoAcceptRunResult,
} from "@/lib/meeting-room-auto-accept-service";
import {
  runReservationAutoAcceptBatch,
  type ReservationAutoAcceptRunResult,
} from "@/lib/reservation-auto-accept-service";

export type CombinedAutoAcceptRunResult = {
  meetingRooms: MeetingRoomAutoAcceptRunResult;
  reservations: ReservationAutoAcceptRunResult;
  totals: ReservationAutoAcceptRunResult;
};

export async function runAutoAcceptBatch(
  now: Date = new Date(),
): Promise<CombinedAutoAcceptRunResult> {
  const [reservations, meetingRooms] = await Promise.all([
    runReservationAutoAcceptBatch(now),
    runMeetingRoomAutoAcceptBatch(now),
  ]);

  return {
    meetingRooms,
    reservations,
    totals: {
      approved: reservations.approved + meetingRooms.approved,
      considered: reservations.considered + meetingRooms.considered,
      failed: reservations.failed + meetingRooms.failed,
      skipped: reservations.skipped + meetingRooms.skipped,
      stillPending: reservations.stillPending + meetingRooms.stillPending,
    },
  };
}
