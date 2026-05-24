import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import {
  PrismaClient,
  ReservationStatus,
  UserRole,
} from "@prisma/client";

import {
  createCapacityException,
  importIranHolidayScheduleExceptions,
  updateReservationPolicy,
  updateResourcePoolSettings,
} from "@/lib/admin-settings-service";
import { CapacityUnavailableError, getSlotUsage } from "@/lib/capacity-service";
import {
  approveReservation,
  cancelReservationByManager,
  createReservationRequest,
  ReservationTransitionError,
} from "@/lib/reservation-service";
import {
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import {
  ReservationTimeRangeError,
  validateReservationTimeRange,
} from "@/lib/schedule";

const db = new PrismaClient();

const passwordHash = "test-password-hash";
const poolId = "company-systems";
const userId = "normal-user";
const secondUserId = "second-user";
const managerId = "manager-user";
const adminId = "admin-user";

function nextWorkingDateAtHour(hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);

  while (date.getDay() === 5) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

function previousWorkingDateAtHour(hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(hour, 0, 0, 0);

  while (date.getDay() === 5) {
    date.setDate(date.getDate() - 1);
  }

  return date;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function resetDatabase() {
  await db.notification.deleteMany();
  await db.auditLog.deleteMany();
  await db.reservationAlternative.deleteMany();
  await db.reservation.deleteMany();
  await db.resourcePoolCapacityException.deleteMany();
  await db.scheduleException.deleteMany();
  await db.workingSchedule.deleteMany();
  await db.resourcePool.deleteMany();
  await db.reservationPolicy.deleteMany();
  await db.user.deleteMany();

  await db.user.createMany({
    data: [
      {
        id: userId,
        email: "user@example.test",
        name: "Normal User",
        passwordHash,
        role: UserRole.USER,
      },
      {
        id: secondUserId,
        email: "second@example.test",
        name: "Second User",
        passwordHash,
        role: UserRole.USER,
      },
      {
        id: managerId,
        email: "manager@example.test",
        name: "Manager User",
        passwordHash,
        role: UserRole.MANAGER,
      },
      {
        id: adminId,
        email: "admin@example.test",
        name: "Admin User",
        passwordHash,
        role: UserRole.ADMIN,
      },
    ],
  });

  await db.resourcePool.create({
    data: {
      id: poolId,
      name: "Company Systems",
      capacity: 1,
      active: true,
    },
  });

  await db.reservationPolicy.create({
    data: {
      id: "default",
      dailyUserHourLimit: 3,
      oneReservationPerDayEnabled: true,
    },
  });

  await db.workingSchedule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isWorkingDay: dayOfWeek !== 5,
      startTime: "09:00",
      endTime: "17:00",
    })),
  });
}

async function createReservation(input: {
  userId?: string;
  startAt: Date;
  endAt: Date;
  status: ReservationStatus;
}) {
  return db.reservation.create({
    data: {
      userId: input.userId ?? userId,
      resourcePoolId: poolId,
      startAt: input.startAt,
      endAt: input.endAt,
      status: input.status,
    },
  });
}

beforeEach(resetDatabase);

after(async () => {
  await db.$disconnect();
});

test("pending reservations are visible but do not consume approved capacity", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await createReservation({ startAt, endAt, status: ReservationStatus.PENDING });

  const usage = await getSlotUsage({ resourcePoolId: poolId, startAt, endAt });

  assert.equal(usage[0].approvedCount, 0);
  assert.equal(usage[0].pendingCount, 1);
  assert.equal(usage[0].capacity, 1);
});

test("approved reservations consume capacity", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await createReservation({ startAt, endAt, status: ReservationStatus.APPROVED });

  const usage = await getSlotUsage({ resourcePoolId: poolId, startAt, endAt });

  assert.equal(usage[0].approvedCount, 1);
  assert.equal(usage[0].pendingCount, 0);
});

test("approval fails when any requested hour is already full", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await createReservation({
    userId: secondUserId,
    startAt,
    endAt,
    status: ReservationStatus.APPROVED,
  });
  const pending = await createReservation({
    startAt,
    endAt,
    status: ReservationStatus.PENDING,
  });

  await assert.rejects(
    () => approveReservation({ reservationId: pending.id, managerId }),
    CapacityUnavailableError,
  );
});

test("reservation requests outside working hours are rejected", async () => {
  const startAt = nextWorkingDateAtHour(8);
  const endAt = addHours(startAt, 1);

  await assert.rejects(
    () => createReservationRequest({ userId, resourcePoolId: poolId, startAt, endAt }),
    ReservationTimeRangeError,
  );
});

test("reservation time range cannot span multiple calendar days", async () => {
  const startAt = nextWorkingDateAtHour(16);
  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 1);
  endAt.setHours(10, 0, 0, 0);

  await assert.rejects(
    () => validateReservationTimeRange({ startAt, endAt }),
    ReservationTimeRangeError,
  );
});

test("official Iran holidays are non-working unless overridden", async () => {
  const holidayDate = parseJalaliDateParam("1405-03-06");

  assert.ok(holidayDate);

  const startAt = new Date(
    holidayDate.getFullYear(),
    holidayDate.getMonth(),
    holidayDate.getDate(),
    9,
    0,
    0,
    0,
  );
  const endAt = addHours(startAt, 1);

  await assert.rejects(
    () => validateReservationTimeRange({ startAt, endAt }),
    ReservationTimeRangeError,
  );
});

test("schedule exceptions can override official Iran holidays", async () => {
  const holidayDate = parseJalaliDateParam("1405-03-06");

  assert.ok(holidayDate);

  await db.scheduleException.create({
    data: {
      date: holidayDate,
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
      reason: "Special working day.",
    },
  });

  const startAt = new Date(
    holidayDate.getFullYear(),
    holidayDate.getMonth(),
    holidayDate.getDate(),
    9,
    0,
    0,
    0,
  );
  const endAt = addHours(startAt, 1);

  await assert.doesNotReject(() =>
    validateReservationTimeRange({ startAt, endAt }),
  );
});

test("imported Iran holiday titles use official overrides", async () => {
  const result = await importIranHolidayScheduleExceptions({
    adminId,
    year: 1405,
  });
  const holidayDate = parseJalaliDateParam("1405-03-06");

  assert.ok(holidayDate);
  assert.ok(result.createdCount > 0);

  const exception = await db.scheduleException.findUnique({
    where: { date: holidayDate },
  });

  assert.equal(exception?.isWorkingDay, false);
  assert.match(exception?.reason ?? "", /عید سعید قربان/);
});

test("reservation time range must start and end on exact hours", async () => {
  const startAt = nextWorkingDateAtHour(9);
  startAt.setMinutes(30);
  const endAt = addHours(startAt, 1);

  await assert.rejects(
    () => validateReservationTimeRange({ startAt, endAt }),
    ReservationTimeRangeError,
  );
});

test("reservation requests cannot start in the past", async () => {
  const startAt = previousWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);

  await assert.rejects(
    () => createReservationRequest({ userId, resourcePoolId: poolId, startAt, endAt }),
    ReservationTimeRangeError,
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

test("admin cannot reduce capacity below future approved usage", async () => {
  await db.resourcePool.update({
    where: { id: poolId },
    data: { capacity: 2 },
  });
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await createReservation({ startAt, endAt, status: ReservationStatus.APPROVED });
  await createReservation({
    userId: secondUserId,
    startAt,
    endAt,
    status: ReservationStatus.APPROVED,
  });

  await assert.rejects(() =>
    updateResourcePoolSettings({
      adminId,
      resourcePoolId: poolId,
      name: "Company Systems",
      capacity: 1,
      active: true,
    }),
  );
});

test("daily capacity exceptions override default capacity", async () => {
  await db.resourcePool.update({
    where: { id: poolId },
    data: { capacity: 2 },
  });
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);

  await createCapacityException({
    adminId,
    resourcePoolId: poolId,
    date: startAt,
    capacity: 1,
    reason: "One system is under repair.",
  });

  const usage = await getSlotUsage({ resourcePoolId: poolId, startAt, endAt });

  assert.equal(usage[0].capacity, 1);
});

test("users cannot request more than the configured daily hour limit", async () => {
  const firstStartAt = nextWorkingDateAtHour(9);
  const firstEndAt = addHours(firstStartAt, 2);
  const secondStartAt = addHours(firstStartAt, 2);
  const secondEndAt = addHours(secondStartAt, 2);

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

test("daily capacity exceptions can close capacity for a day", async () => {
  await db.resourcePool.update({
    where: { id: poolId },
    data: { capacity: 2 },
  });
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);

  await createCapacityException({
    adminId,
    resourcePoolId: poolId,
    date: startAt,
    capacity: 0,
    reason: "Systems are unavailable.",
  });

  const usage = await getSlotUsage({ resourcePoolId: poolId, startAt, endAt });
  const pending = await createReservation({
    startAt,
    endAt,
    status: ReservationStatus.PENDING,
  });

  assert.equal(usage[0].capacity, 0);
  await assert.rejects(
    () => approveReservation({ reservationId: pending.id, managerId }),
    CapacityUnavailableError,
  );
});

test("admin cannot set daily capacity below approved usage for that day", async () => {
  await db.resourcePool.update({
    where: { id: poolId },
    data: { capacity: 3 },
  });
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await createReservation({ startAt, endAt, status: ReservationStatus.APPROVED });
  await createReservation({
    userId: secondUserId,
    startAt,
    endAt,
    status: ReservationStatus.APPROVED,
  });

  await assert.rejects(() =>
    createCapacityException({
      adminId,
      resourcePoolId: poolId,
      date: startAt,
      capacity: 1,
      reason: "Two systems are under repair.",
    }),
  );
});
