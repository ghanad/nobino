import assert from "node:assert/strict";
import { test } from "node:test";

import { ReservationStatus } from "@prisma/client";

import { runAutoAcceptBatch } from "@/lib/auto-accept-service";
import { runDeskAutoAcceptBatch } from "@/lib/desk-auto-accept-service";
import {
  deleteBuilding,
  updateDesk,
  updateDeskSettings,
  updateBuildingDesks,
  updateBuildingWeeklySchedule,
} from "@/lib/desk-admin-service";
import { approveDeskReservation, createDeskReservation, updateDeskReservation } from "@/lib/desk-reservation-service";
import { formatJalaliDate } from "@/lib/jalali-date";
import { ReservationTransitionError } from "@/lib/reservation-service";

import { addHours, adminId, db, deskId, managerId, nextWorkingDateAtHour, buildingId, registerBusinessRuleTestHooks, secondDeskId, secondUserId, userId } from "./business-rules-helpers";

registerBusinessRuleTestHooks();

test("desk reservation starts pending and notifies managers", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const reservation = await createDeskReservation({ deskId, endAt: addHours(startAt, 2), startAt, userId });
  assert.equal(reservation.status, ReservationStatus.PENDING);
  assert.equal(reservation.autoApprovalAt, null);
  assert.equal(await db.notification.count({ where: { deskReservationId: reservation.id, type: "NEW_PENDING_DESK_RESERVATION" } }), 2);
  const notification = await db.notification.findFirstOrThrow({
    where: { deskReservationId: reservation.id, type: "NEW_PENDING_DESK_RESERVATION" },
  });
  assert.equal(
    notification.body,
    `درخواست رزرو Desk One در Main Building توسط Normal User برای تاریخ ${formatJalaliDate(startAt)} در انتظار بررسی است.`,
  );
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

test("existing building desks are saved together with per-desk audit logs", async () => {
  await updateBuildingDesks({
    adminId,
    buildingId,
    desks: [
      { active: true, deskId, name: "Renamed Desk", sortOrder: 1 },
      { active: true, deskId: secondDeskId, name: "Desk Two", sortOrder: 3 },
    ],
  });

  const desks = await db.desk.findMany({
    where: { buildingId },
    orderBy: { id: "asc" },
  });
  assert.equal(desks.find((desk) => desk.id === deskId)?.name, "Renamed Desk");
  assert.equal(desks.find((desk) => desk.id === secondDeskId)?.sortOrder, 3);
  assert.equal(await db.auditLog.count({
    where: { action: "DESK_UPDATED", entityType: "Desk" },
  }), 2);
});

test("a blocked desk change prevents every desk edit from being saved", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const reservation = await createDeskReservation({
    deskId: secondDeskId,
    endAt: addHours(startAt, 1),
    startAt,
    userId,
  });
  await approveDeskReservation({ managerId, reservationId: reservation.id });

  await assert.rejects(
    updateBuildingDesks({
      adminId,
      buildingId,
      desks: [
        { active: true, deskId, name: "Must Not Save", sortOrder: 1 },
        {
          active: false,
          deskId: secondDeskId,
          name: "Desk Two",
          sortOrder: 2,
        },
      ],
    }),
    /ابتدا رزروهای فعال میزهای غیرفعال‌شده/,
  );

  assert.equal(
    (await db.desk.findUniqueOrThrow({ where: { id: deskId } })).name,
    "Desk One",
  );
  assert.equal(
    (await db.desk.findUniqueOrThrow({ where: { id: secondDeskId } })).active,
    true,
  );
  assert.equal(await db.auditLog.count({
    where: { action: "DESK_UPDATED" },
  }), 0);
});

test("building weekly schedule is saved as one audited update", async () => {
  const schedules = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    endTime: dayOfWeek === 0 ? "21:00" : "17:00",
    isWorkingDay: dayOfWeek !== 4 && dayOfWeek !== 5,
    startTime: "09:00",
  }));

  await updateBuildingWeeklySchedule({ adminId, buildingId, schedules });

  const stored = await db.buildingWeeklySchedule.findMany({
    where: { buildingId },
    orderBy: { dayOfWeek: "asc" },
  });
  assert.equal(stored.length, 7);
  assert.equal(stored[0].endTime, "21:00");
  assert.equal(stored[4].isWorkingDay, false);
  assert.equal(await db.auditLog.count({
    where: {
      action: "BUILDING_SCHEDULE_UPDATED",
      entityType: "BuildingWeeklySchedule",
    },
  }), 2);
});

test("invalid building weekly schedule does not partially update any day", async () => {
  const schedules = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    endTime: dayOfWeek === 3 ? "08:00" : "18:00",
    isWorkingDay: dayOfWeek !== 5,
    startTime: "09:00",
  }));

  await assert.rejects(
    updateBuildingWeeklySchedule({ adminId, buildingId, schedules }),
    /ساعت پایان هر روز کاری/,
  );

  const stored = await db.buildingWeeklySchedule.findMany({
    where: { buildingId },
  });
  assert.ok(stored.every((schedule) => schedule.endTime === "17:00"));
  assert.equal(await db.auditLog.count({
    where: { action: "BUILDING_SCHEDULE_UPDATED" },
  }), 0);
});

test("deleting an building preserves history and removes future desk reservations", async () => {
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

  await deleteBuilding({ adminId, buildingId: (await db.desk.findUniqueOrThrow({
    where: { id: deskId },
    select: { buildingId: true },
  })).buildingId });

  const building = await db.building.findUniqueOrThrow({
    where: { id: (await db.desk.findUniqueOrThrow({ where: { id: deskId } })).buildingId },
  });
  assert.equal(building.active, false);
  assert.ok(building.deletedAt);
  assert.equal(await db.deskReservation.findUnique({ where: { id: futureReservation.id } }), null);
  assert.ok(await db.deskReservation.findUnique({ where: { id: historicalReservation.id } }));
  assert.equal(await db.auditLog.count({
    where: { action: "BUILDING_DELETED", entityId: building.id },
  }), 1);
});
