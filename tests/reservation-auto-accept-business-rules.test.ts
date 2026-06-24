import assert from "node:assert/strict";
import { test } from "node:test";

import { ReservationStatus } from "@prisma/client";

import {
  AdminSettingsError,
  updateReservationPolicy,
} from "@/lib/admin-settings-service";
import {
  approveReservation,
  cancelReservationByUser,
  createReservationRequest,
  rejectReservation,
  updateReservationTimeByManager,
} from "@/lib/reservation-service";
import { runReservationAutoAcceptBatch } from "@/lib/reservation-auto-accept-service";

import {
  addHours,
  adminId,
  db,
  managerId,
  markDateWorkingForTest,
  nextWorkingDateAtHour,
  poolId,
  registerBusinessRuleTestHooks,
  secondUserId,
  startOfLocalDay,
  userId,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

const HOUR_MS = 60 * 60 * 1000;

async function enableAutoAccept(options?: {
  autoAcceptDelayHours?: number;
  dailyUserHourLimit?: number;
}) {
  return updateReservationPolicy({
    adminId,
    autoAcceptDelayHours: options?.autoAcceptDelayHours ?? 4,
    autoAcceptEnabled: true,
    dailyUserHourLimit: options?.dailyUserHourLimit ?? 3,
    oneReservationPerDayEnabled: false,
  });
}

async function setWorkingWindowForDate(
  date: Date,
  startTime = "00:00",
  endTime = "23:00",
) {
  await db.scheduleException.upsert({
    where: { date: startOfLocalDay(date) },
    update: {
      endTime,
      isWorkingDay: true,
      reason: "Test working day",
      startTime,
    },
    create: {
      date: startOfLocalDay(date),
      endTime,
      isWorkingDay: true,
      reason: "Test working day",
      startTime,
    },
  });
}

test("auto approval defaults to disabled, does not backfill, and clears pending deadlines when disabled", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markDateWorkingForTest(startAt);

  const disabledReservation = await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt,
    endAt,
  });

  assert.equal(disabledReservation.autoAcceptAt, null);

  await enableAutoAccept({ autoAcceptDelayHours: 4 });

  const disabledReservationAfterEnable = await db.reservation.findUniqueOrThrow({
    where: { id: disabledReservation.id },
    select: { autoAcceptAt: true },
  });

  assert.equal(disabledReservationAfterEnable.autoAcceptAt, null);

  const enabledReservation = await createReservationRequest({
    userId: secondUserId,
    resourcePoolId: poolId,
    startAt: addHours(startAt, 1),
    endAt: addHours(endAt, 1),
  });

  assert.ok(enabledReservation.autoAcceptAt);

  await updateReservationPolicy({
    adminId,
    autoAcceptDelayHours: 4,
    autoAcceptEnabled: false,
    dailyUserHourLimit: 3,
    oneReservationPerDayEnabled: false,
  });

  const clearedReservation = await db.reservation.findUniqueOrThrow({
    where: { id: enabledReservation.id },
    select: { autoAcceptAt: true },
  });

  assert.equal(clearedReservation.autoAcceptAt, null);
});

test("admins are required for reservation policy changes and delay validation stays within 1 to 24", async () => {
  await assert.rejects(
    () =>
      updateReservationPolicy({
        adminId: managerId,
        autoAcceptDelayHours: 4,
        autoAcceptEnabled: true,
        dailyUserHourLimit: 3,
        oneReservationPerDayEnabled: false,
      }),
    AdminSettingsError,
  );

  await assert.rejects(
    () =>
      updateReservationPolicy({
        adminId,
        autoAcceptDelayHours: 0,
        autoAcceptEnabled: true,
        dailyUserHourLimit: 3,
        oneReservationPerDayEnabled: false,
      }),
    AdminSettingsError,
  );

  await assert.rejects(
    () =>
      updateReservationPolicy({
        adminId,
        autoAcceptDelayHours: 25,
        autoAcceptEnabled: true,
        dailyUserHourLimit: 3,
        oneReservationPerDayEnabled: false,
      }),
    AdminSettingsError,
  );
});

test("auto approval deadline is based on request creation time", async () => {
  const startAt = nextWorkingDateAtHour(12);
  const endAt = addHours(startAt, 1);
  await markDateWorkingForTest(startAt);
  await enableAutoAccept({ autoAcceptDelayHours: 4 });

  const reservation = await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt,
    endAt,
  });

  assert.ok(reservation.autoAcceptAt);
  assert.equal(
    reservation.autoAcceptAt.getTime() - reservation.createdAt.getTime(),
    4 * HOUR_MS,
  );
});

test("short notice requests clamp the deadline to the reservation start time", async () => {
  const startAt = new Date();
  startAt.setMinutes(0, 0, 0);
  startAt.setHours(startAt.getHours() + 2);
  const endAt = addHours(startAt, 1);
  await setWorkingWindowForDate(startAt, "00:00", "23:00");
  await enableAutoAccept({ autoAcceptDelayHours: 4 });

  const reservation = await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt,
    endAt,
  });

  assert.ok(reservation.autoAcceptAt);
  assert.equal(reservation.autoAcceptAt.getTime(), startAt.getTime());
});

test("manager time changes reset the pending deadline", async () => {
  const startAt = new Date();
  startAt.setMinutes(0, 0, 0);
  startAt.setHours(startAt.getHours() + 8);
  const proposedStartAt = new Date();
  proposedStartAt.setMinutes(0, 0, 0);
  proposedStartAt.setHours(proposedStartAt.getHours() + 3);
  const proposedEndAt = addHours(proposedStartAt, 1);
  await setWorkingWindowForDate(startAt, "00:00", "23:00");
  await setWorkingWindowForDate(proposedStartAt, "00:00", "23:00");
  await enableAutoAccept({ autoAcceptDelayHours: 4 });

  const reservation = await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt,
    endAt: addHours(startAt, 1),
  });

  const updated = await updateReservationTimeByManager({
    reservationId: reservation.id,
    managerId,
    proposedStartAt,
    proposedEndAt,
  });

  assert.equal(updated.autoAcceptAt?.getTime(), proposedStartAt.getTime());
});

test("FIFO auto approval approves the oldest eligible request first and retries later when capacity frees up", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markDateWorkingForTest(startAt);
  await enableAutoAccept({ autoAcceptDelayHours: 1 });

  const first = await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt,
    endAt,
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = await createReservationRequest({
    userId: secondUserId,
    resourcePoolId: poolId,
    startAt,
    endAt,
  });

  const firstRun = await runReservationAutoAcceptBatch(addHours(new Date(), 2));

  assert.equal(firstRun.considered, 2);
  assert.equal(firstRun.approved, 1);
  assert.equal(firstRun.stillPending, 1);
  assert.equal(firstRun.skipped, 0);
  assert.equal(firstRun.failed, 0);

  const firstReservation = await db.reservation.findUniqueOrThrow({
    where: { id: first.id },
    select: { status: true },
  });
  const secondReservation = await db.reservation.findUniqueOrThrow({
    where: { id: second.id },
    select: { status: true },
  });

  assert.equal(firstReservation.status, ReservationStatus.APPROVED);
  assert.equal(secondReservation.status, ReservationStatus.PENDING);

  await cancelReservationByUser({
    reservationId: first.id,
    userId,
  });

  const secondRun = await runReservationAutoAcceptBatch(addHours(new Date(), 2));

  assert.equal(secondRun.considered, 1);
  assert.equal(secondRun.approved, 1);

  const approvedSecondReservation = await db.reservation.findUniqueOrThrow({
    where: { id: second.id },
    select: { status: true },
  });

  assert.equal(approvedSecondReservation.status, ReservationStatus.APPROVED);
});

test("auto approval re-checks the current daily user limit before approving", async () => {
  const startAt = nextWorkingDateAtHour(11);
  const endAt = addHours(startAt, 1);
  const pendingStartAt = addHours(startAt, 1);
  const pendingEndAt = addHours(pendingStartAt, 1);
  await markDateWorkingForTest(startAt);
  await enableAutoAccept({ autoAcceptDelayHours: 1, dailyUserHourLimit: 3 });

  await approveReservation({
    reservationId: (
      await createReservationRequest({
        userId,
        resourcePoolId: poolId,
        startAt,
        endAt,
      })
    ).id,
    managerId,
  });

  const reservation = await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt: pendingStartAt,
    endAt: pendingEndAt,
  });

  await updateReservationPolicy({
    adminId,
    autoAcceptDelayHours: 1,
    autoAcceptEnabled: true,
    dailyUserHourLimit: 1,
    oneReservationPerDayEnabled: false,
  });

  const result = await runReservationAutoAcceptBatch(addHours(new Date(), 2));

  assert.equal(result.approved, 0);
  assert.equal(result.stillPending, 1);

  const storedReservation = await db.reservation.findUniqueOrThrow({
    where: { id: reservation.id },
    select: { status: true },
  });

  assert.equal(storedReservation.status, ReservationStatus.PENDING);
});

test("manual approval, rejection, and cancellation before the deadline are respected by auto approval", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markDateWorkingForTest(startAt);
  await enableAutoAccept({ autoAcceptDelayHours: 1 });

  const approved = await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt,
    endAt,
  });
  const rejected = await createReservationRequest({
    userId: secondUserId,
    resourcePoolId: poolId,
    startAt: addHours(startAt, 1),
    endAt: addHours(endAt, 1),
  });
  const cancelled = await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt: addHours(startAt, 2),
    endAt: addHours(endAt, 2),
  });

  await approveReservation({
    reservationId: approved.id,
    managerId,
  });
  await rejectReservation({
    reservationId: rejected.id,
    managerId,
  });
  await cancelReservationByUser({
    reservationId: cancelled.id,
    userId,
  });

  const result = await runReservationAutoAcceptBatch(addHours(new Date(), 2));

  assert.equal(result.approved, 0);
  assert.equal(result.considered, 0);
  assert.equal(result.stillPending, 0);
  assert.equal(result.skipped, 0);

  const storedApproved = await db.reservation.findUniqueOrThrow({
    where: { id: approved.id },
    select: { status: true },
  });
  const storedRejected = await db.reservation.findUniqueOrThrow({
    where: { id: rejected.id },
    select: { status: true },
  });
  const storedCancelled = await db.reservation.findUniqueOrThrow({
    where: { id: cancelled.id },
    select: { status: true },
  });

  assert.equal(storedApproved.status, ReservationStatus.APPROVED);
  assert.equal(storedRejected.status, ReservationStatus.REJECTED);
  assert.equal(storedCancelled.status, ReservationStatus.CANCELLED_BY_USER);
});

test("auto approval writes a null actor audit log, notifies the requester, and repeated runs stay idempotent", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markDateWorkingForTest(startAt);
  await enableAutoAccept({ autoAcceptDelayHours: 1 });

  const reservation = await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt,
    endAt,
  });

  const firstRun = await runReservationAutoAcceptBatch(addHours(new Date(), 2));
  const secondRun = await runReservationAutoAcceptBatch(addHours(new Date(), 2));

  assert.equal(firstRun.approved, 1);
  assert.equal(secondRun.approved, 0);
  assert.equal(secondRun.considered, 0);
  assert.equal(secondRun.skipped, 0);

  const auditLogs = await db.auditLog.findMany({
    where: {
      entityId: reservation.id,
      action: "RESERVATION_AUTO_APPROVED",
    },
    select: { actorUserId: true, action: true },
  });
  const notifications = await db.notification.findMany({
    where: {
      reservationId: reservation.id,
      type: "RESERVATION_AUTO_APPROVED",
      userId,
    },
    select: { id: true },
  });

  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0]?.actorUserId, null);
  assert.equal(notifications.length, 1);
});

test("expired reservations are not automatically approved", async () => {
  const now = new Date();
  const expiredAt = addHours(now, -2);
  const expiredEndAt = addHours(now, -1);

  await db.reservation.create({
    data: {
      userId,
      resourcePoolId: poolId,
      startAt: expiredAt,
      endAt: expiredEndAt,
      status: ReservationStatus.PENDING,
      autoAcceptAt: addHours(now, -1),
    },
  });

  await enableAutoAccept({ autoAcceptDelayHours: 1 });

  const result = await runReservationAutoAcceptBatch(now);

  assert.equal(result.considered, 0);

  const storedReservation = await db.reservation.findFirstOrThrow({
    where: {
      status: ReservationStatus.PENDING,
      endAt: expiredEndAt,
    },
    select: { status: true },
  });

  assert.equal(storedReservation.status, ReservationStatus.PENDING);
});
