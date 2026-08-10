import assert from "node:assert/strict";
import { test } from "node:test";

import { ReservationStatus } from "@prisma/client";

import { updateReservationPolicy } from "@/lib/admin-settings-service";
import { CapacityUnavailableError, getSlotUsage } from "@/lib/capacity-service";
import { formatJalaliDate } from "@/lib/jalali-date";
import {
  approveReservation,
  cancelReservationByManager,
  cancelReservationByUser,
  createReservationRequest,
  proposeAlternative,
  ReservationTransitionError,
  updateReservationTimeByManager,
} from "@/lib/reservation-service";

import {
  addHours,
  adminId,
  createReservation,
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

test("reservation requests store the requested people count", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markDateWorkingForTest(startAt);

  const reservation = await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt,
    endAt,
    partySize: 3,
  });

  assert.equal(reservation.partySize, 3);
  const notification = await db.notification.findFirstOrThrow({
    where: {
      reservationId: reservation.id,
      type: "NEW_PENDING_RESERVATION",
    },
  });
  assert.equal(
    notification.body,
    `درخواست رزرو Company Systems توسط Normal User برای تاریخ ${formatJalaliDate(startAt)} در انتظار بررسی است.`,
  );
});

test("manager time updates keep reservations pending", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  const proposedStartAt = addHours(startAt, 2);
  const proposedEndAt = addHours(proposedStartAt, 1);
  await db.scheduleException.create({
    data: {
      date: startOfLocalDay(startAt),
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
      reason: "Test working day",
    },
  });
  const pending = await createReservation({
    startAt,
    endAt,
    status: ReservationStatus.PENDING,
  });

  const updated = await proposeAlternative({
    reservationId: pending.id,
    managerId,
    proposedStartAt,
    proposedEndAt,
  });

  assert.equal(updated.status, ReservationStatus.PENDING);
  assert.equal(updated.startAt.getTime(), proposedStartAt.getTime());
  assert.equal(updated.endAt.getTime(), proposedEndAt.getTime());

  const usage = await getSlotUsage({
    resourcePoolId: poolId,
    startAt: proposedStartAt,
    endAt: proposedEndAt,
  });

  assert.equal(usage[0].approvedCount, 0);
  assert.equal(usage[0].pendingCount, 1);
});

test("manager time updates can exceed the daily user hour limit for that request", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  const proposedEndAt = addHours(startAt, 4);
  await markDateWorkingForTest(startAt);
  await updateReservationPolicy({
    adminId,
    dailyUserHourLimit: 3,
    oneReservationPerDayEnabled: true,
  });
  const pending = await createReservation({
    startAt,
    endAt,
    status: ReservationStatus.PENDING,
  });

  const updated = await proposeAlternative({
    reservationId: pending.id,
    managerId,
    proposedStartAt: startAt,
    proposedEndAt,
  });

  assert.equal(updated.status, ReservationStatus.PENDING);
  assert.equal(updated.startAt.getTime(), startAt.getTime());
  assert.equal(updated.endAt.getTime(), proposedEndAt.getTime());
  await assert.doesNotReject(() =>
    approveReservation({ reservationId: pending.id, managerId }),
  );
});

test("manager time updates keep approved reservations approved and notify the user", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  const proposedStartAt = addHours(startAt, 2);
  const proposedEndAt = addHours(proposedStartAt, 1);
  await markDateWorkingForTest(startAt);
  const approved = await createReservation({
    startAt,
    endAt,
    status: ReservationStatus.APPROVED,
  });

  const updated = await updateReservationTimeByManager({
    reservationId: approved.id,
    managerId,
    proposedStartAt,
    proposedEndAt,
  });

  assert.equal(updated.status, ReservationStatus.APPROVED);
  assert.equal(updated.startAt.getTime(), proposedStartAt.getTime());
  assert.equal(updated.endAt.getTime(), proposedEndAt.getTime());

  const oldUsage = await getSlotUsage({
    resourcePoolId: poolId,
    startAt,
    endAt,
  });
  const newUsage = await getSlotUsage({
    resourcePoolId: poolId,
    startAt: proposedStartAt,
    endAt: proposedEndAt,
  });
  const notification = await db.notification.findFirst({
    where: {
      reservationId: approved.id,
      type: "RESERVATION_TIME_UPDATED",
      userId,
    },
  });

  assert.equal(oldUsage[0].approvedCount, 0);
  assert.equal(newUsage[0].approvedCount, 1);
  assert.ok(notification);
});

test("manager approved time updates fail when the destination approved capacity is full", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  const occupiedStartAt = addHours(startAt, 2);
  const occupiedEndAt = addHours(occupiedStartAt, 1);
  await markDateWorkingForTest(startAt);
  const approved = await createReservation({
    startAt,
    endAt,
    status: ReservationStatus.APPROVED,
  });
  await createReservation({
    userId: secondUserId,
    startAt: occupiedStartAt,
    endAt: occupiedEndAt,
    status: ReservationStatus.APPROVED,
  });

  await assert.rejects(
    () =>
      updateReservationTimeByManager({
        reservationId: approved.id,
        managerId,
        proposedStartAt: occupiedStartAt,
        proposedEndAt: occupiedEndAt,
      }),
    CapacityUnavailableError,
  );
});

test("normal users cannot approve their own reservation", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  const pending = await createReservation({
    startAt,
    endAt,
    status: ReservationStatus.PENDING,
  });

  await assert.rejects(
    () => approveReservation({ reservationId: pending.id, managerId: userId }),
    ReservationTransitionError,
  );
});

test("manager approval notification includes the resource pool, building, and Jalali date", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const pending = await createReservation({
    startAt,
    endAt: addHours(startAt, 1),
    status: ReservationStatus.PENDING,
  });

  await approveReservation({ reservationId: pending.id, managerId });

  const notification = await db.notification.findFirstOrThrow({
    where: { reservationId: pending.id, type: "RESERVATION_APPROVED", userId },
  });
  assert.equal(
    notification.body,
    `رزرو شما برای Company Systems در ساختمان Main Building در تاریخ ${formatJalaliDate(startAt)} تایید شد.`,
  );
});

test("manager cancellation removes approved reservation from capacity", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  const approved = await createReservation({
    startAt,
    endAt,
    status: ReservationStatus.APPROVED,
  });

  await cancelReservationByManager({
    reservationId: approved.id,
    managerId,
  });

  const usage = await getSlotUsage({ resourcePoolId: poolId, startAt, endAt });
  const cancelled = await db.reservation.findUniqueOrThrow({
    where: { id: approved.id },
    select: { cancelledById: true, status: true },
  });

  assert.equal(cancelled.status, ReservationStatus.CANCELLED_BY_ADMIN);
  assert.equal(cancelled.cancelledById, managerId);
  assert.equal(usage[0].approvedCount, 0);
});

test("requesters can cancel approved reservations and release capacity", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await markDateWorkingForTest(startAt);
  const approved = await createReservation({
    startAt,
    endAt,
    status: ReservationStatus.APPROVED,
  });

  const cancelled = await cancelReservationByUser({
    reservationId: approved.id,
    userId,
  });
  const usage = await getSlotUsage({ resourcePoolId: poolId, startAt, endAt });

  assert.equal(cancelled.status, ReservationStatus.CANCELLED_BY_USER);
  assert.equal(cancelled.cancelledById, userId);
  assert.equal(usage[0].approvedCount, 0);
  await assert.doesNotReject(() =>
    createReservationRequest({
      userId: secondUserId,
      resourcePoolId: poolId,
      startAt,
      endAt,
    }),
  );
});

test("users cannot request more than the configured daily hour limit", async () => {
  const firstStartAt = nextWorkingDateAtHour(9);
  const firstEndAt = addHours(firstStartAt, 2);
  const secondStartAt = addHours(firstStartAt, 2);
  const secondEndAt = addHours(secondStartAt, 2);
  await markDateWorkingForTest(firstStartAt);

  await updateReservationPolicy({
    adminId,
    dailyUserHourLimit: 3,
    oneReservationPerDayEnabled: false,
  });

  await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt: firstStartAt,
    endAt: firstEndAt,
  });

  await assert.rejects(
    () =>
      createReservationRequest({
        userId,
        resourcePoolId: poolId,
        startAt: secondStartAt,
        endAt: secondEndAt,
      }),
    ReservationTransitionError,
  );
});

test("admin can change the daily user hour limit", async () => {
  const firstStartAt = nextWorkingDateAtHour(9);
  const firstEndAt = addHours(firstStartAt, 2);
  const secondStartAt = addHours(firstStartAt, 2);
  const secondEndAt = addHours(secondStartAt, 2);
  await markDateWorkingForTest(firstStartAt);

  await updateReservationPolicy({
    adminId,
    dailyUserHourLimit: 4,
    oneReservationPerDayEnabled: false,
  });

  await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt: firstStartAt,
    endAt: firstEndAt,
  });
  await assert.doesNotReject(() =>
    createReservationRequest({
      userId,
      resourcePoolId: poolId,
      startAt: secondStartAt,
      endAt: secondEndAt,
    }),
  );
});

test("users cannot create more than one active reservation per day when enabled", async () => {
  const firstStartAt = nextWorkingDateAtHour(9);
  const firstEndAt = addHours(firstStartAt, 1);
  const secondStartAt = addHours(firstStartAt, 1);
  const secondEndAt = addHours(secondStartAt, 1);
  await markDateWorkingForTest(firstStartAt);

  await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt: firstStartAt,
    endAt: firstEndAt,
  });

  await assert.rejects(
    () =>
      createReservationRequest({
        userId,
        resourcePoolId: poolId,
        startAt: secondStartAt,
        endAt: secondEndAt,
      }),
    ReservationTransitionError,
  );
});

test("users can create multiple same-day reservations when one-per-day policy is disabled", async () => {
  const firstStartAt = nextWorkingDateAtHour(9);
  const firstEndAt = addHours(firstStartAt, 1);
  const secondStartAt = addHours(firstStartAt, 1);
  const secondEndAt = addHours(secondStartAt, 1);
  await markDateWorkingForTest(firstStartAt);

  await updateReservationPolicy({
    adminId,
    dailyUserHourLimit: 3,
    oneReservationPerDayEnabled: false,
  });

  await createReservationRequest({
    userId,
    resourcePoolId: poolId,
    startAt: firstStartAt,
    endAt: firstEndAt,
  });

  await assert.doesNotReject(() =>
    createReservationRequest({
      userId,
      resourcePoolId: poolId,
      startAt: secondStartAt,
      endAt: secondEndAt,
    }),
  );
});

test("approval re-checks approved daily user hour limit", async () => {
  const firstStartAt = nextWorkingDateAtHour(9);
  const firstEndAt = addHours(firstStartAt, 2);
  const secondStartAt = addHours(firstStartAt, 2);
  const secondEndAt = addHours(secondStartAt, 2);
  await updateReservationPolicy({
    adminId,
    dailyUserHourLimit: 3,
    oneReservationPerDayEnabled: false,
  });
  await createReservation({
    startAt: firstStartAt,
    endAt: firstEndAt,
    status: ReservationStatus.APPROVED,
  });
  const pending = await createReservation({
    startAt: secondStartAt,
    endAt: secondEndAt,
    status: ReservationStatus.PENDING,
  });

  await assert.rejects(
    () => approveReservation({ reservationId: pending.id, managerId }),
    ReservationTransitionError,
  );
});

test("approval re-checks one active approved reservation per day", async () => {
  const firstStartAt = nextWorkingDateAtHour(9);
  const firstEndAt = addHours(firstStartAt, 1);
  const secondStartAt = addHours(firstStartAt, 1);
  const secondEndAt = addHours(secondStartAt, 1);
  await createReservation({
    startAt: firstStartAt,
    endAt: firstEndAt,
    status: ReservationStatus.APPROVED,
  });
  const pending = await createReservation({
    startAt: secondStartAt,
    endAt: secondEndAt,
    status: ReservationStatus.PENDING,
  });

  await assert.rejects(
    () => approveReservation({ reservationId: pending.id, managerId }),
    ReservationTransitionError,
  );
});
