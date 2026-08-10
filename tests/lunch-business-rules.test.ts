import assert from "node:assert/strict";
import { test } from "node:test";

import { LunchReservationStatus, ReservationStatus } from "@prisma/client";

import {
  cancelLunchReservationByManager,
  cancelLunchReservationByUser,
  createLunchReservation,
  LunchReservationError,
  updateLunchReservationLocation,
} from "@/lib/lunch-service";
import { shouldOfferBreakfastForStart } from "@/lib/food-reservation-rules";
import { formatJalaliDate } from "@/lib/jalali-date";
import {
  cancelReservationByManager,
  rejectReservation,
} from "@/lib/reservation-service";

import {
  addDays,
  addHours,
  db,
  buildingId,
  managerId,
  nextMidweekIranHolidayDateAtHour,
  nextWorkingDateAtHour,
  poolId,
  registerBusinessRuleTestHooks,
  secondBuildingId,
  secondUserId,
  startOfLocalDay,
  userId,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

test("breakfast is suggested only when a system reservation starts before 12", () => {
  const beforeNoon = new Date(2026, 6, 19, 11, 0, 0, 0);
  const atNoon = new Date(2026, 6, 19, 12, 0, 0, 0);
  const afterNoon = new Date(2026, 6, 19, 13, 0, 0, 0);

  assert.equal(shouldOfferBreakfastForStart(beforeNoon), true);
  assert.equal(shouldOfferBreakfastForStart(atNoon), false);
  assert.equal(shouldOfferBreakfastForStart(afterNoon), false);
});

test("food reservations store breakfast and lunch with one shared building", async () => {
  const targetDate = nextWorkingDateAtHour(9);
  const reservation = await createLunchReservation({
    userId,
    buildingId: buildingId,
    date: targetDate,
    breakfastReserved: true,
    lunchReserved: true,
  });

  assert.equal(reservation.breakfastReserved, true);
  assert.equal(reservation.lunchReserved, true);
  assert.equal(reservation.buildingId, buildingId);

  const updated = await updateLunchReservationLocation({
    reservationId: reservation.id,
    userId,
    buildingId: secondBuildingId,
    breakfastReserved: true,
    lunchReserved: false,
  });

  assert.equal(updated.breakfastReserved, true);
  assert.equal(updated.lunchReserved, false);
  assert.equal(updated.buildingId, secondBuildingId);
});

test("food reservations require at least one meal", async () => {
  const targetDate = nextWorkingDateAtHour(9);

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        buildingId: buildingId,
        date: targetDate,
        breakfastReserved: false,
        lunchReserved: false,
      }),
    LunchReservationError,
  );
});

test("transitional buildings cannot be used for lunch even when accidentally enabled", async () => {
  const transitional = await db.building.create({
    data: { id: "needs-assignment", name: "Needs assignment", active: true, isTransitional: true },
  });

  await assert.rejects(
    createLunchReservation({ userId, buildingId: transitional.id, date: nextWorkingDateAtHour(12) }),
    LunchReservationError,
  );
});

test("system food suggestions infer the source pool building and reject tampered input", async () => {
  const targetDate = nextWorkingDateAtHour(9);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);
  const pool = await db.resourcePool.create({
    data: {
      id: "building-b-systems",
      buildingId: secondBuildingId,
      capacity: 1,
      name: "Building B Systems",
      active: true,
    },
  });
  const source = await db.reservation.create({
    data: {
      userId,
      resourcePoolId: pool.id,
      startAt: targetDate,
      endAt: addHours(targetDate, 1),
      status: ReservationStatus.PENDING,
    },
  });

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        buildingId,
        date: targetDate,
        sourceReservationId: source.id,
        now: beforeCutoff,
      }),
    LunchReservationError,
  );

  const reservation = await createLunchReservation({
    userId,
    buildingId: secondBuildingId,
    date: targetDate,
    sourceReservationId: source.id,
    now: beforeCutoff,
  });

  assert.equal(reservation.buildingId, secondBuildingId);
});

test("system food suggestions require a source reservation owned by the user", async () => {
  const targetDate = nextWorkingDateAtHour(9);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);
  const pool = await db.resourcePool.create({
    data: {
      id: "building-b-systems",
      buildingId: secondBuildingId,
      capacity: 1,
      name: "Building B Systems",
      active: true,
    },
  });
  const source = await db.reservation.create({
    data: {
      userId: secondUserId,
      resourcePoolId: pool.id,
      startAt: targetDate,
      endAt: addHours(targetDate, 1),
      status: ReservationStatus.PENDING,
    },
  });

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        buildingId: secondBuildingId,
        date: targetDate,
        sourceReservationId: source.id,
        now: beforeCutoff,
      }),
    LunchReservationError,
  );
});

test("desk food suggestions infer the desk building without storing a desk relation", async () => {
  const targetDate = nextWorkingDateAtHour(9);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);
  const desk = await db.desk.create({
    data: {
      id: "building-b-desk",
      buildingId: secondBuildingId,
      name: "Building B Desk",
      active: true,
      sortOrder: 1,
    },
  });
  const source = await db.deskReservation.create({
    data: {
      userId,
      deskId: desk.id,
      startAt: targetDate,
      endAt: addHours(targetDate, 1),
      status: ReservationStatus.PENDING,
    },
  });

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        buildingId,
        date: targetDate,
        sourceDeskReservationId: source.id,
        now: beforeCutoff,
      }),
    LunchReservationError,
  );

  const reservation = await createLunchReservation({
    userId,
    buildingId: secondBuildingId,
    date: targetDate,
    sourceDeskReservationId: source.id,
    now: beforeCutoff,
  });

  assert.equal(reservation.buildingId, secondBuildingId);
  assert.equal(reservation.sourceReservationId, null);
});

test("lunch rejects buildings deactivated or deleted after the form was rendered", async () => {
  const targetDate = nextWorkingDateAtHour(9);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);

  await db.building.update({
    where: { id: secondBuildingId },
    data: { active: false },
  });
  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        buildingId: secondBuildingId,
        date: targetDate,
        now: beforeCutoff,
      }),
    LunchReservationError,
  );

  await db.building.update({
    where: { id: buildingId },
    data: { deletedAt: new Date() },
  });
  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        buildingId,
        date: targetDate,
        now: beforeCutoff,
      }),
    LunchReservationError,
  );
});

test("manager cancellation and rejection cancel linked food but preserve manual food", async () => {
  const firstStartAt = nextWorkingDateAtHour(9);
  const firstSystemReservation = await db.reservation.create({
    data: {
      userId,
      resourcePoolId: poolId,
      startAt: firstStartAt,
      endAt: addHours(firstStartAt, 1),
      status: ReservationStatus.APPROVED,
    },
  });
  const linkedFood = await createLunchReservation({
    userId,
    buildingId: buildingId,
    date: firstStartAt,
    breakfastReserved: true,
    lunchReserved: true,
    sourceReservationId: firstSystemReservation.id,
  });

  await cancelReservationByManager({
    reservationId: firstSystemReservation.id,
    managerId,
  });

  assert.equal(
    (
      await db.lunchReservation.findUniqueOrThrow({
        where: { id: linkedFood.id },
      })
    ).status,
    LunchReservationStatus.CANCELLED_BY_ADMIN,
  );

  const secondStartAt = nextWorkingDateAtHour(9);
  const pendingSystemReservation = await db.reservation.create({
    data: {
      userId,
      resourcePoolId: poolId,
      startAt: secondStartAt,
      endAt: addHours(secondStartAt, 1),
      status: ReservationStatus.PENDING,
    },
  });
  const linkedToPendingFood = await createLunchReservation({
    userId,
    buildingId: buildingId,
    date: secondStartAt,
    breakfastReserved: true,
    lunchReserved: false,
    sourceReservationId: pendingSystemReservation.id,
  });

  await rejectReservation({
    reservationId: pendingSystemReservation.id,
    managerId,
  });

  assert.equal(
    (
      await db.lunchReservation.findUniqueOrThrow({
        where: { id: linkedToPendingFood.id },
      })
    ).status,
    LunchReservationStatus.CANCELLED_BY_ADMIN,
  );

  const unrelatedPendingReservation = await db.reservation.create({
    data: {
      userId,
      resourcePoolId: poolId,
      startAt: secondStartAt,
      endAt: addHours(secondStartAt, 1),
      status: ReservationStatus.PENDING,
    },
  });
  const manualFood = await createLunchReservation({
    userId,
    buildingId: buildingId,
    date: secondStartAt,
    breakfastReserved: true,
    lunchReserved: false,
  });

  await rejectReservation({
    reservationId: unrelatedPendingReservation.id,
    managerId,
  });

  assert.equal(
    (
      await db.lunchReservation.findUniqueOrThrow({
        where: { id: manualFood.id },
      })
    ).status,
    LunchReservationStatus.ACTIVE,
  );
});

test("lunch reservation closes at and after the previous-day cutoff", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const atCutoff = addDays(startOfLocalDay(targetDate), -1);
  atCutoff.setHours(23, 59, 0, 0);
  const afterCutoff = addDays(startOfLocalDay(targetDate), -1);
  afterCutoff.setHours(23, 59, 1, 0);

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        buildingId: buildingId,
        date: targetDate,
        now: atCutoff,
      }),
    LunchReservationError,
  );

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        buildingId: buildingId,
        date: targetDate,
        now: afterCutoff,
      }),
    LunchReservationError,
  );
});

test("users can have only one active lunch reservation per day", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);

  await createLunchReservation({
    userId,
    buildingId: buildingId,
    date: targetDate,
    now: beforeCutoff,
  });

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        buildingId: secondBuildingId,
        date: targetDate,
        now: beforeCutoff,
      }),
    LunchReservationError,
  );
});

test("users can change or cancel their own lunch reservation before cutoff", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);

  const reservation = await createLunchReservation({
    userId,
    buildingId: buildingId,
    date: targetDate,
    now: beforeCutoff,
  });

  const updated = await updateLunchReservationLocation({
    reservationId: reservation.id,
    userId,
    buildingId: secondBuildingId,
    now: beforeCutoff,
  });

  assert.equal(updated.buildingId, secondBuildingId);

  const cancelled = await cancelLunchReservationByUser({
    reservationId: reservation.id,
    userId,
    now: beforeCutoff,
  });

  assert.equal(cancelled.status, LunchReservationStatus.CANCELLED_BY_USER);
});

test("users cannot change or cancel their own lunch reservation at the cutoff", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);
  const atCutoff = addDays(startOfLocalDay(targetDate), -1);
  atCutoff.setHours(23, 59, 0, 0);

  const reservation = await createLunchReservation({
    userId,
    buildingId: buildingId,
    date: targetDate,
    now: beforeCutoff,
  });

  await assert.rejects(
    () =>
      updateLunchReservationLocation({
        reservationId: reservation.id,
        userId,
        buildingId: secondBuildingId,
        now: atCutoff,
      }),
    LunchReservationError,
  );

  await assert.rejects(
    () =>
      cancelLunchReservationByUser({
        reservationId: reservation.id,
        userId,
        now: atCutoff,
      }),
    LunchReservationError,
  );
});

test("users cannot cancel their own lunch reservation after cutoff", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);
  const afterCutoff = addDays(startOfLocalDay(targetDate), -1);
  afterCutoff.setHours(23, 59, 1, 0);

  const reservation = await createLunchReservation({
    userId,
    buildingId: buildingId,
    date: targetDate,
    now: beforeCutoff,
  });

  await assert.rejects(
    () =>
      cancelLunchReservationByUser({
        reservationId: reservation.id,
        userId,
        now: afterCutoff,
      }),
    LunchReservationError,
  );
});

test("managers can cancel anyone's active lunch reservation after cutoff", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);
  const afterCutoff = addDays(startOfLocalDay(targetDate), -1);
  afterCutoff.setHours(23, 59, 1, 0);

  const reservation = await createLunchReservation({
    userId,
    buildingId: buildingId,
    date: targetDate,
    now: beforeCutoff,
  });

  const cancelled = await cancelLunchReservationByManager({
    reservationId: reservation.id,
    managerId,
    now: afterCutoff,
  });

  assert.equal(cancelled.status, LunchReservationStatus.CANCELLED_BY_ADMIN);

  const [auditLog, notification] = await Promise.all([
    db.auditLog.findFirst({
      where: {
        entityId: reservation.id,
        action: "FOOD_RESERVATION_CANCELLED_BY_MANAGER",
      },
    }),
    db.notification.findFirst({
      where: { lunchReservationId: reservation.id, type: "FOOD_CANCELLED" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  assert.equal(auditLog?.actorUserId, managerId);
  assert.equal(auditLog?.action, "FOOD_RESERVATION_CANCELLED_BY_MANAGER");
  assert.equal(notification?.userId, userId);
  assert.equal(
    notification?.body,
    `رزرو غذای شما برای ${formatJalaliDate(targetDate)} توسط مدیر لغو شد.`,
  );
});

test("regular users cannot use manager lunch cancellation", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);

  const reservation = await createLunchReservation({
    userId,
    buildingId: buildingId,
    date: targetDate,
    now: beforeCutoff,
  });

  await assert.rejects(
    () =>
      cancelLunchReservationByManager({
        reservationId: reservation.id,
        managerId: userId,
      }),
    LunchReservationError,
  );
});

test("friday lunch is disabled by default", async () => {
  const targetDate = nextWorkingDateAtHour(12);

  while (targetDate.getDay() !== 5) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        buildingId: buildingId,
        date: targetDate,
        now: beforeCutoff,
      }),
    LunchReservationError,
  );
});

test("official Iran holidays disable lunch service on midweek days", async () => {
  const targetDate = await nextMidweekIranHolidayDateAtHour(12);
  const day = startOfLocalDay(targetDate);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);

  await db.lunchException.deleteMany({ where: { date: day } });

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        buildingId: buildingId,
        date: targetDate,
        now: beforeCutoff,
      }),
    LunchReservationError,
  );
});

test("lunch exceptions can enable service on official Iran holidays", async () => {
  const targetDate = await nextMidweekIranHolidayDateAtHour(12);
  const day = startOfLocalDay(targetDate);
  const beforeCutoff = addDays(day, -1);
  beforeCutoff.setHours(12, 0, 0, 0);

  await db.lunchException.upsert({
    where: { date: day },
    update: { isServiceDay: true },
    create: {
      date: day,
      isServiceDay: true,
    },
  });

  const reservation = await createLunchReservation({
    userId,
    buildingId: buildingId,
    date: targetDate,
    now: beforeCutoff,
  });

  assert.equal(reservation.date.getTime(), day.getTime());
});
