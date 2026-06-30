import assert from "node:assert/strict";
import { test } from "node:test";

import { ReservationStatus } from "@prisma/client";

import { runAutoAcceptBatch } from "@/lib/auto-accept-service";
import { CapacityUnavailableError } from "@/lib/capacity-service";
import {
  assertMeetingRoomCapacityAvailableForApproval,
  getMeetingRoomSlotUsage,
} from "@/lib/meeting-room-capacity-service";
import { runMeetingRoomAutoAcceptBatch } from "@/lib/meeting-room-auto-accept-service";
import { updateMeetingRoom } from "@/lib/meeting-room-admin-service";
import {
  approveMeetingRoomReservation,
  cancelMeetingRoomReservationByUser,
  createMeetingRoomReservationRequest,
} from "@/lib/meeting-room-reservation-service";
import { validateMeetingRoomReservationTimeRange } from "@/lib/meeting-room-schedule";
import { ReservationTransitionError } from "@/lib/reservation-service";
import { ReservationTimeRangeError } from "@/lib/schedule";
import {
  buildLocalDateAtHourFromJalali,
  formatJalaliDateParam,
} from "@/lib/jalali-date";

import {
  addHours,
  adminId,
  db,
  managerId,
  markMeetingRoomDateWorkingForTest,
  meetingRoomId,
  nextWorkingDateAtHour,
  registerBusinessRuleTestHooks,
  secondMeetingRoomId,
  secondUserId,
  startOfLocalDay,
  userId,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

test("meeting room reservation starts pending when auto approval is disabled", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markMeetingRoomDateWorkingForTest(startAt);

  const reservation = await createMeetingRoomReservationRequest({
    userId,
    roomId: meetingRoomId,
    startAt,
    endAt,
    title: "Planning",
  });

  assert.equal(reservation.status, ReservationStatus.PENDING);
  assert.equal(reservation.title, "Planning");
});

test("meeting room auto approval uses its own delay and approves only when capacity is available", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markMeetingRoomDateWorkingForTest(startAt);
  await db.meetingRoom.update({
    where: { id: meetingRoomId },
    data: { autoApprovalDelayHours: 2, autoApprovalEnabled: true },
  });

  const pending = await createMeetingRoomReservationRequest({
    userId,
    roomId: meetingRoomId,
    startAt,
    endAt,
  });

  assert.equal(pending.status, ReservationStatus.PENDING);
  assert.ok(pending.autoApprovalAt);
  assert.equal(
    pending.autoApprovalAt.getTime(),
    Math.min(pending.createdAt.getTime() + 2 * 60 * 60 * 1000, startAt.getTime()),
  );

  await createMeetingRoomReservationRequest({
    userId: secondUserId,
    roomId: meetingRoomId,
    startAt,
    endAt,
  });

  const result = await runMeetingRoomAutoAcceptBatch(
    addHours(pending.autoApprovalAt, 1),
  );
  const reservations = await db.meetingRoomReservation.findMany({
    where: { roomId: meetingRoomId, startAt, endAt },
    orderBy: { createdAt: "asc" },
    select: { autoApprovalAt: true, status: true },
  });

  assert.equal(result.considered, 2);
  assert.equal(result.approved, 1);
  assert.equal(result.stillPending, 1);
  assert.equal(reservations[0].status, ReservationStatus.APPROVED);
  assert.equal(reservations[0].autoApprovalAt, null);
  assert.equal(reservations[1].status, ReservationStatus.PENDING);
});

test("shared auto accept batch also runs meeting room auto accept", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markMeetingRoomDateWorkingForTest(startAt);
  await db.meetingRoom.update({
    where: { id: meetingRoomId },
    data: { autoApprovalDelayHours: 1, autoApprovalEnabled: true },
  });

  const pending = await createMeetingRoomReservationRequest({
    userId,
    roomId: meetingRoomId,
    startAt,
    endAt,
  });
  assert.ok(pending.autoApprovalAt);

  await db.meetingRoomReservation.update({
    where: { id: pending.id },
    data: { autoApprovalAt: addHours(new Date(), -1) },
  });

  const result = await runAutoAcceptBatch();
  const reservation = await db.meetingRoomReservation.findUniqueOrThrow({
    where: { id: pending.id },
    select: { status: true },
  });

  assert.equal(result.meetingRooms.approved, 1);
  assert.equal(result.reservations.approved, 0);
  assert.equal(result.totals.approved, 1);
  assert.equal(reservation.status, ReservationStatus.APPROVED);
});

test("pending meeting room reservations are visible but do not block another request", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markMeetingRoomDateWorkingForTest(startAt);

  await createMeetingRoomReservationRequest({
    userId,
    roomId: meetingRoomId,
    startAt,
    endAt,
  });
  await createMeetingRoomReservationRequest({
    userId: secondUserId,
    roomId: meetingRoomId,
    startAt,
    endAt,
  });

  const usage = await getMeetingRoomSlotUsage({
    roomId: meetingRoomId,
    startAt,
    endAt,
  });

  assert.equal(usage[0].pendingCount, 2);
  assert.equal(usage[0].approvedCount, 0);
});

test("approved meeting room reservations block overlapping approval", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markMeetingRoomDateWorkingForTest(startAt);
  const first = await createMeetingRoomReservationRequest({
    userId,
    roomId: meetingRoomId,
    startAt,
    endAt,
  });
  const second = await createMeetingRoomReservationRequest({
    userId: secondUserId,
    roomId: meetingRoomId,
    startAt,
    endAt,
  });

  await approveMeetingRoomReservation({
    reservationId: first.id,
    managerId,
  });

  await assert.rejects(
    () =>
      approveMeetingRoomReservation({
        reservationId: second.id,
        managerId,
      }),
    CapacityUnavailableError,
  );
});

test("transactional meeting room approval re-check prevents overbooking", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markMeetingRoomDateWorkingForTest(startAt);
  const pending = await createMeetingRoomReservationRequest({
    userId,
    roomId: meetingRoomId,
    startAt,
    endAt,
  });
  await db.meetingRoomReservation.create({
    data: {
      userId: secondUserId,
      roomId: meetingRoomId,
      startAt,
      endAt,
      status: ReservationStatus.APPROVED,
    },
  });

  await assert.rejects(
    () =>
      db.$transaction((tx) =>
        assertMeetingRoomCapacityAvailableForApproval(
          {
            roomId: meetingRoomId,
            startAt,
            endAt,
            excludeReservationId: pending.id,
          },
          tx,
        ),
      ),
    CapacityUnavailableError,
  );
});

test("users can cancel their own approved meeting room reservations", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markMeetingRoomDateWorkingForTest(startAt);
  const pending = await createMeetingRoomReservationRequest({
    userId,
    roomId: meetingRoomId,
    startAt,
    endAt,
  });
  await approveMeetingRoomReservation({ reservationId: pending.id, managerId });

  const cancelled = await cancelMeetingRoomReservationByUser({
    reservationId: pending.id,
    userId,
  });
  const usage = await getMeetingRoomSlotUsage({
    roomId: meetingRoomId,
    startAt,
    endAt,
  });

  assert.equal(cancelled.status, ReservationStatus.CANCELLED_BY_USER);
  assert.equal(usage[0].approvedCount, 0);
});

test("meeting room schedule validation is room specific", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await db.meetingRoomWeeklySchedule.update({
    where: {
      roomId_dayOfWeek: {
        roomId: meetingRoomId,
        dayOfWeek: startAt.getDay(),
      },
    },
    data: { isWorkingDay: false },
  });
  await markMeetingRoomDateWorkingForTest(startAt, secondMeetingRoomId);

  await assert.rejects(
    () =>
      validateMeetingRoomReservationTimeRange({
        roomId: meetingRoomId,
        startAt,
        endAt,
      }),
    ReservationTimeRangeError,
  );
  await assert.doesNotReject(() =>
    validateMeetingRoomReservationTimeRange({
      roomId: secondMeetingRoomId,
      startAt,
      endAt,
    }),
  );
});

test("meeting room exceptions block only that room and date", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markMeetingRoomDateWorkingForTest(startAt, secondMeetingRoomId);
  await db.meetingRoomScheduleException.create({
    data: {
      roomId: meetingRoomId,
      date: startOfLocalDay(startAt),
      isWorkingDay: false,
      reason: "Room maintenance",
    },
  });

  await assert.rejects(
    () =>
      createMeetingRoomReservationRequest({
        userId,
        roomId: meetingRoomId,
        startAt,
        endAt,
      }),
    ReservationTimeRangeError,
  );
  await assert.doesNotReject(() =>
    createMeetingRoomReservationRequest({
      userId,
      roomId: secondMeetingRoomId,
      startAt,
      endAt,
    }),
  );
});

test("meeting room exact-hour, duration, and cross-day rules apply", async () => {
  const startAt = nextWorkingDateAtHour(9);
  await markMeetingRoomDateWorkingForTest(startAt);

  await assert.rejects(
    () =>
      validateMeetingRoomReservationTimeRange({
        roomId: meetingRoomId,
        startAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        endAt: addHours(startAt, 2),
      }),
    ReservationTimeRangeError,
  );
  await assert.rejects(
    () =>
      validateMeetingRoomReservationTimeRange({
        roomId: meetingRoomId,
        startAt,
        endAt: startAt,
      }),
    ReservationTimeRangeError,
  );
  await assert.rejects(
    () =>
      validateMeetingRoomReservationTimeRange({
        roomId: meetingRoomId,
        startAt,
        endAt: addHours(startAt, 9),
      }),
    ReservationTimeRangeError,
  );
  const lateStart = new Date(
    startAt.getFullYear(),
    startAt.getMonth(),
    startAt.getDate(),
    23,
    0,
    0,
    0,
  );
  await assert.rejects(
    () =>
      validateMeetingRoomReservationTimeRange({
        roomId: meetingRoomId,
        startAt: lateStart,
        endAt: addHours(lateStart, 2),
      }),
    ReservationTimeRangeError,
  );
});

test("meeting room Jalali date params build the requested local hours", async () => {
  const startAt = nextWorkingDateAtHour(10);
  await markMeetingRoomDateWorkingForTest(startAt);
  const jalaliParam = formatJalaliDateParam(startAt);
  const parsedStart = buildLocalDateAtHourFromJalali(jalaliParam, 10);
  const parsedEnd = buildLocalDateAtHourFromJalali(jalaliParam, 11);

  assert.equal(parsedStart.getHours(), 10);
  assert.equal(parsedEnd.getHours(), 11);
  await assert.doesNotReject(() =>
    createMeetingRoomReservationRequest({
      userId,
      roomId: meetingRoomId,
      startAt: parsedStart,
      endAt: parsedEnd,
    }),
  );
});

test("normal users cannot approve meeting room reservations", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markMeetingRoomDateWorkingForTest(startAt);
  const pending = await createMeetingRoomReservationRequest({
    userId,
    roomId: meetingRoomId,
    startAt,
    endAt,
  });

  await assert.rejects(
    () =>
      approveMeetingRoomReservation({
        reservationId: pending.id,
        managerId: userId,
      }),
    ReservationTransitionError,
  );
});

test("admin room updates create audit logs", async () => {
  await updateMeetingRoom({
    adminId,
    roomId: meetingRoomId,
    name: "Main Meeting Room",
    isActive: false,
    sortOrder: 1,
    autoApprovalEnabled: true,
    autoApprovalDelayHours: 3,
  });

  const auditLog = await db.auditLog.findFirst({
    where: {
      entityType: "MeetingRoom",
      entityId: meetingRoomId,
      action: "MEETING_ROOM_ACTIVE_STATUS_CHANGED",
    },
  });

  assert.ok(auditLog);
});
