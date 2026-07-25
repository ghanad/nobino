import assert from "node:assert/strict";
import { test } from "node:test";

import { ReservationStatus } from "@prisma/client";

import { runAutoAcceptBatch } from "@/lib/auto-accept-service";
import { runDeskAutoAcceptBatch } from "@/lib/desk-auto-accept-service";
import { deleteOffice, updateDesk, updateDeskSettings } from "@/lib/desk-admin-service";
import { approveDeskReservation, createDeskReservation, updateDeskReservation } from "@/lib/desk-reservation-service";
import { ReservationTransitionError } from "@/lib/reservation-service";

import { addHours, adminId, db, deskId, managerId, nextWorkingDateAtHour, registerBusinessRuleTestHooks, secondDeskId, secondUserId, userId } from "./business-rules-helpers";

registerBusinessRuleTestHooks();

test("desk reservation starts pending and notifies managers", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const reservation = await createDeskReservation({ deskId, endAt: addHours(startAt, 2), startAt, userId });
  assert.equal(reservation.status, ReservationStatus.PENDING);
  assert.equal(reservation.autoApprovalAt, null);
  assert.equal(await db.notification.count({ where: { deskReservationId: reservation.id, type: "NEW_PENDING_DESK_RESERVATION" } }), 2);
});

test("desk auto approval uses the existing shared cron batch", async () => {
  await updateDeskSettings({
    adminId,
    autoApprovalDelayHours: 2,
    autoApprovalEnabled: true,
    maxAdvanceDays: 14,
  });
  const startAt = nextWorkingDateAtHour(9);
  const pending = await createDeskReservation({
    deskId,
    endAt: addHours(startAt, 1),
    startAt,
    userId,
  });

  assert.ok(pending.autoApprovalAt);
  assert.equal(
    pending.autoApprovalAt.getTime(),
    Math.min(pending.createdAt.getTime() + 2 * 60 * 60 * 1000, startAt.getTime()),
  );
  await db.deskReservation.update({
    where: { id: pending.id },
    data: { autoApprovalAt: addHours(new Date(), -1) },
  });

  const result = await runAutoAcceptBatch();
  const approved = await db.deskReservation.findUniqueOrThrow({
    where: { id: pending.id },
  });

  assert.equal(result.desks.approved, 1);
  assert.equal(result.totals.approved, 1);
  assert.equal(approved.status, ReservationStatus.APPROVED);
  assert.equal(approved.autoApprovalAt, null);
  assert.equal(await db.auditLog.count({
    where: { action: "DESK_RESERVATION_AUTO_APPROVED", entityId: pending.id },
  }), 1);
  assert.equal(await db.notification.count({
    where: { deskReservationId: pending.id, type: "DESK_RESERVATION_AUTO_APPROVED" },
  }), 1);
});

test("desk auto approval leaves a conflicting request pending", async () => {
  await updateDeskSettings({
    adminId,
    autoApprovalDelayHours: 1,
    autoApprovalEnabled: true,
    maxAdvanceDays: 14,
  });
  const startAt = nextWorkingDateAtHour(9);
  const first = await createDeskReservation({
    deskId,
    endAt: addHours(startAt, 1),
    startAt,
    userId,
  });
  const second = await createDeskReservation({
    deskId,
    endAt: addHours(startAt, 1),
    startAt,
    userId: secondUserId,
  });
  await db.deskReservation.updateMany({
    where: { id: { in: [first.id, second.id] } },
    data: { autoApprovalAt: addHours(new Date(), -1) },
  });

  const result = await runDeskAutoAcceptBatch();
  const reservations = await db.deskReservation.findMany({
    where: { id: { in: [first.id, second.id] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  assert.equal(result.considered, 2);
  assert.equal(result.approved, 1);
  assert.equal(result.stillPending, 1);
  assert.equal(reservations[0].status, ReservationStatus.APPROVED);
  assert.equal(reservations[1].status, ReservationStatus.PENDING);
});

test("disabling desk auto approval clears pending deadlines without backfilling", async () => {
  await updateDeskSettings({
    adminId,
    autoApprovalDelayHours: 1,
    autoApprovalEnabled: true,
    maxAdvanceDays: 14,
  });
  const startAt = nextWorkingDateAtHour(9);
  const pending = await createDeskReservation({
    deskId,
    endAt: addHours(startAt, 1),
    startAt,
    userId,
  });
  assert.ok(pending.autoApprovalAt);

  await updateDeskSettings({
    adminId,
    autoApprovalDelayHours: 1,
    autoApprovalEnabled: false,
    maxAdvanceDays: 14,
  });
  assert.equal((await db.deskReservation.findUniqueOrThrow({
    where: { id: pending.id },
  })).autoApprovalAt, null);

  await updateDeskSettings({
    adminId,
    autoApprovalDelayHours: 1,
    autoApprovalEnabled: true,
    maxAdvanceDays: 14,
  });
  assert.equal((await db.deskReservation.findUniqueOrThrow({
    where: { id: pending.id },
  })).autoApprovalAt, null);
});

test("pending desk requests do not block but approval re-checks conflicts", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const first = await createDeskReservation({ deskId, endAt: addHours(startAt, 2), startAt, userId });
  const second = await createDeskReservation({ deskId, endAt: addHours(startAt, 1), startAt, userId: secondUserId });
  await approveDeskReservation({ managerId, reservationId: first.id });
  await assert.rejects(
    approveDeskReservation({ managerId, reservationId: second.id }),
    ReservationTransitionError,
  );
});

test("approved desk reservations block new overlapping requests", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const first = await createDeskReservation({ deskId, endAt: addHours(startAt, 2), startAt, userId });
  await approveDeskReservation({ managerId, reservationId: first.id });

  await assert.rejects(
    createDeskReservation({ deskId, endAt: addHours(startAt, 3), startAt: addHours(startAt, 1), userId: secondUserId }),
    ReservationTransitionError,
  );
});

test("normal users cannot approve desk requests", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const reservation = await createDeskReservation({ deskId, endAt: addHours(startAt, 1), startAt, userId });
  await assert.rejects(
    approveDeskReservation({ managerId: userId, reservationId: reservation.id }),
    ReservationTransitionError,
  );
});

test("a user can have only one desk reservation per day across desks", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const reservation = await createDeskReservation({ deskId, endAt: addHours(startAt, 1), startAt, userId });
  await approveDeskReservation({ managerId, reservationId: reservation.id });
  await assert.rejects(
    createDeskReservation({ deskId: secondDeskId, endAt: addHours(startAt, 3), startAt: addHours(startAt, 2), userId }),
    ReservationTransitionError,
  );
});

test("manager can move and reschedule a future desk reservation", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const reservation = await createDeskReservation({ deskId, endAt: addHours(startAt, 1), startAt, userId });
  const updated = await updateDeskReservation({
    actorUserId: managerId, deskId: secondDeskId, endAt: addHours(startAt, 3), reservationId: reservation.id, startAt: addHours(startAt, 1),
  });
  assert.equal(updated.deskId, secondDeskId);
  assert.equal(updated.startAt.getTime(), addHours(startAt, 1).getTime());
});

test("desk with a future approved reservation cannot be disabled", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const reservation = await createDeskReservation({ deskId, endAt: addHours(startAt, 1), startAt, userId });
  await approveDeskReservation({ managerId, reservationId: reservation.id });
  await assert.rejects(
    updateDesk({ active: false, adminId, deskId, name: "Desk One", sortOrder: 1 }),
    /ابتدا رزروهای فعال/,
  );
  assert.equal((await db.desk.findUniqueOrThrow({ where: { id: deskId } })).active, true);
});

test("deleting an office preserves history and removes future desk reservations", async () => {
  const futureStart = nextWorkingDateAtHour(9);
  const pastStart = addHours(new Date(), -48);
  const futureReservation = await db.deskReservation.create({
    data: {
      deskId,
      endAt: addHours(futureStart, 1),
      startAt: futureStart,
      status: ReservationStatus.APPROVED,
      userId,
    },
  });
  const historicalReservation = await db.deskReservation.create({
    data: {
      deskId,
      endAt: addHours(pastStart, 1),
      startAt: pastStart,
      status: ReservationStatus.APPROVED,
      userId: secondUserId,
    },
  });

  await deleteOffice({ adminId, officeId: (await db.desk.findUniqueOrThrow({
    where: { id: deskId },
    select: { officeId: true },
  })).officeId });

  const office = await db.office.findUniqueOrThrow({
    where: { id: (await db.desk.findUniqueOrThrow({ where: { id: deskId } })).officeId },
  });
  assert.equal(office.active, false);
  assert.ok(office.deletedAt);
  assert.equal(await db.deskReservation.findUnique({ where: { id: futureReservation.id } }), null);
  assert.ok(await db.deskReservation.findUnique({ where: { id: historicalReservation.id } }));
  assert.equal(await db.auditLog.count({
    where: { action: "OFFICE_DELETED", entityId: office.id },
  }), 1);
});
