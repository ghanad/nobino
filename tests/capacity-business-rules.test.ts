import assert from "node:assert/strict";
import { test } from "node:test";

import { ReservationStatus } from "@prisma/client";

import {
  createCapacityException,
  updateResourcePoolSettings,
} from "@/lib/admin-settings-service";
import { CapacityUnavailableError, getSlotUsage } from "@/lib/capacity-service";
import { approveReservation } from "@/lib/reservation-service";
import { createReservationRequest } from "@/lib/reservation-service";

import {
  addHours,
  adminId,
  buildingId,
  createReservation,
  db,
  managerId,
  nextWorkingDateAtHour,
  poolId,
  registerBusinessRuleTestHooks,
  secondUserId,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

test("pending reservations are visible but do not consume approved capacity", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  await createReservation({ startAt, endAt, status: ReservationStatus.PENDING });

  const usage = await getSlotUsage({ resourcePoolId: poolId, startAt, endAt });

  assert.equal(usage[0].approvedCount, 0);
  assert.equal(usage[0].pendingCount, 1);
  assert.equal(usage[0].capacity, 1);
});

test("an active pool under an inactive building cannot accept system requests", async () => {
  const startAt = nextWorkingDateAtHour(9);
  await db.building.update({ where: { id: buildingId }, data: { active: false } });

  await assert.rejects(
    createReservationRequest({ userId: secondUserId, resourcePoolId: poolId, startAt, endAt: addHours(startAt, 1) }),
    CapacityUnavailableError,
  );
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
