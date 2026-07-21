import assert from "node:assert/strict";
import { test } from "node:test";

import { ReservationStatus } from "@prisma/client";

import { updateDesk } from "@/lib/desk-admin-service";
import { approveDeskReservation, createDeskReservation, updateDeskReservation } from "@/lib/desk-reservation-service";
import { ReservationTransitionError } from "@/lib/reservation-service";

import { addHours, adminId, db, deskId, managerId, nextWorkingDateAtHour, registerBusinessRuleTestHooks, secondDeskId, secondUserId, userId } from "./business-rules-helpers";

registerBusinessRuleTestHooks();

test("desk reservation starts pending and notifies managers", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const reservation = await createDeskReservation({ deskId, endAt: addHours(startAt, 2), startAt, userId });
  assert.equal(reservation.status, ReservationStatus.PENDING);
  assert.equal(await db.notification.count({ where: { deskReservationId: reservation.id, type: "NEW_PENDING_DESK_RESERVATION" } }), 2);
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
