import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import {
  LunchReservationStatus,
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
  cancelLunchReservationByUser,
  createLunchReservation,
  LunchReservationError,
  updateLunchReservationLocation,
} from "@/lib/lunch-service";
import {
  approveReservation,
  cancelReservationByManager,
  createReservationRequest,
  proposeAlternative,
  ReservationTransitionError,
  updateReservationTimeByManager,
} from "@/lib/reservation-service";
import {
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import {
  ReservationTimeRangeError,
  validateReservationTimeRange,
} from "@/lib/schedule";
import {
  deleteManagedUser,
  findOrProvisionLdapUser,
  UserManagementError,
} from "@/lib/user-management-service";

const db = new PrismaClient();

const passwordHash = "test-password-hash";
const poolId = "company-systems";
const lunchLocationId = "building-a";
const secondLunchLocationId = "building-b";
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

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
}

function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

async function markDateWorkingForTest(date: Date) {
  await db.scheduleException.upsert({
    where: { date: startOfLocalDay(date) },
    update: {
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
      reason: "Test working day",
    },
    create: {
      date: startOfLocalDay(date),
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
      reason: "Test working day",
    },
  });
}

async function resetDatabase() {
  await db.notification.deleteMany();
  await db.auditLog.deleteMany();
  await db.lunchReservation.deleteMany();
  await db.lunchLocation.deleteMany();
  await db.lunchException.deleteMany();
  await db.lunchWeeklySchedule.deleteMany();
  await db.lunchSettings.deleteMany();
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

  await db.lunchSettings.create({
    data: {
      id: "default",
      enabled: true,
      maxAdvanceDays: 7,
      cutoffTime: "23:59",
    },
  });

  await db.lunchWeeklySchedule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isServiceDay: dayOfWeek !== 5,
    })),
  });

  await db.lunchLocation.createMany({
    data: [
      {
        id: lunchLocationId,
        name: "Building A",
        active: true,
      },
      {
        id: secondLunchLocationId,
        name: "Building B",
        active: true,
      },
    ],
  });
}

async function createReservation(input: {
  userId?: string;
  startAt: Date;
  endAt: Date;
  partySize?: number;
  status: ReservationStatus;
}) {
  return db.reservation.create({
    data: {
      userId: input.userId ?? userId,
      resourcePoolId: poolId,
      startAt: input.startAt,
      endAt: input.endAt,
      partySize: input.partySize ?? 1,
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
});

test("reservation people count does not consume additional capacity", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await createReservation({
    startAt,
    endAt,
    partySize: 3,
    status: ReservationStatus.APPROVED,
  });

  const usage = await getSlotUsage({ resourcePoolId: poolId, startAt, endAt });

  assert.equal(usage[0].approvedCount, 1);
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

test("lunch reservation closes after the previous-day cutoff", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const cutoffPassed = addDays(startOfLocalDay(targetDate), -1);
  cutoffPassed.setHours(23, 59, 1, 0);

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        locationId: lunchLocationId,
        date: targetDate,
        now: cutoffPassed,
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
    locationId: lunchLocationId,
    date: targetDate,
    now: beforeCutoff,
  });

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        locationId: secondLunchLocationId,
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
    locationId: lunchLocationId,
    date: targetDate,
    now: beforeCutoff,
  });

  const updated = await updateLunchReservationLocation({
    reservationId: reservation.id,
    userId,
    locationId: secondLunchLocationId,
    now: beforeCutoff,
  });

  assert.equal(updated.locationId, secondLunchLocationId);

  const cancelled = await cancelLunchReservationByUser({
    reservationId: reservation.id,
    userId,
    now: beforeCutoff,
  });

  assert.equal(cancelled.status, LunchReservationStatus.CANCELLED_BY_USER);
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
        locationId: lunchLocationId,
        date: targetDate,
        now: beforeCutoff,
      }),
    LunchReservationError,
  );
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
  const holidayDate = parseJalaliDateParam("1405-03-14");

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
  const holidayDate = parseJalaliDateParam("1405-03-14");

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

test("ldap-authenticated users are provisioned with the default user role", async () => {
  const user = await findOrProvisionLdapUser({
    email: "new-user@example.test",
    name: "New LDAP User",
  });

  const [storedUser, auditLog] = await Promise.all([
    db.user.findUnique({
      where: { email: "new-user@example.test" },
      select: {
        active: true,
        canViewLunchReport: true,
        name: true,
        passwordHash: true,
        role: true,
      },
    }),
    db.auditLog.findFirst({
      where: {
        entityId: user?.id,
        action: "USER_CREATED",
      },
    }),
  ]);

  assert.equal(user?.active, true);
  assert.equal(user?.role, UserRole.USER);
  assert.equal(storedUser?.active, true);
  assert.equal(storedUser?.canViewLunchReport, false);
  assert.equal(storedUser?.name, "New LDAP User");
  assert.equal(storedUser?.passwordHash, "ldap-provisioned");
  assert.equal(storedUser?.role, UserRole.USER);
  assert.equal(auditLog?.actorUserId, null);
});

test("ldap provisioning preserves disabled user access control", async () => {
  await db.user.update({
    where: { id: secondUserId },
    data: {
      active: false,
      deletedAt: new Date(),
    },
  });

  const user = await findOrProvisionLdapUser({
    email: "second@example.test",
    name: "Second User",
  });

  const storedUser = await db.user.findUnique({
    where: { id: secondUserId },
    select: { active: true, deletedAt: true },
  });

  assert.equal(user, null);
  assert.equal(storedUser?.active, false);
  assert.ok(storedUser?.deletedAt);
});

test("admin can delete a managed user without removing reservation history", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  const reservation = await createReservation({
    userId: secondUserId,
    startAt,
    endAt,
    status: ReservationStatus.APPROVED,
  });

  await deleteManagedUser({ adminId, userId: secondUserId });

  const [deletedUser, existingReservation, auditLog] = await Promise.all([
    db.user.findUnique({
      where: { id: secondUserId },
      select: { active: true, deletedAt: true },
    }),
    db.reservation.findUnique({
      where: { id: reservation.id },
      select: { userId: true },
    }),
    db.auditLog.findFirst({
      where: {
        entityId: secondUserId,
        action: "USER_DELETED",
      },
    }),
  ]);

  assert.equal(deletedUser?.active, false);
  assert.ok(deletedUser?.deletedAt);
  assert.equal(existingReservation?.userId, secondUserId);
  assert.ok(auditLog);
});

test("admin cannot delete their own account", async () => {
  await assert.rejects(
    () => deleteManagedUser({ adminId, userId: adminId }),
    UserManagementError,
  );

  const admin = await db.user.findUnique({
    where: { id: adminId },
    select: { active: true, deletedAt: true },
  });

  assert.equal(admin?.active, true);
  assert.equal(admin?.deletedAt, null);
});
