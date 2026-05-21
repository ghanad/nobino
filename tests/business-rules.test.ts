import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import {
  PrismaClient,
  ReservationStatus,
  UserRole,
} from "@prisma/client";

import { updateResourcePoolSettings } from "@/lib/admin-settings-service";
import { CapacityUnavailableError, getSlotUsage } from "@/lib/capacity-service";
import {
  approveReservation,
  createReservationRequest,
  ReservationTransitionError,
} from "@/lib/reservation-service";
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

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function resetDatabase() {
  await db.notification.deleteMany();
  await db.auditLog.deleteMany();
  await db.reservationAlternative.deleteMany();
  await db.reservation.deleteMany();
  await db.scheduleException.deleteMany();
  await db.workingSchedule.deleteMany();
  await db.resourcePool.deleteMany();
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

test("reservation time range must start and end on exact hours", async () => {
  const startAt = nextWorkingDateAtHour(9);
  startAt.setMinutes(30);
  const endAt = addHours(startAt, 1);

  await assert.rejects(
    () => validateReservationTimeRange({ startAt, endAt }),
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
