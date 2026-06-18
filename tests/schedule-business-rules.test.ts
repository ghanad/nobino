import assert from "node:assert/strict";
import { test } from "node:test";

import {
  importIranHolidayScheduleExceptions,
} from "@/lib/admin-settings-service";
import { parseJalaliDateParam } from "@/lib/jalali-date";
import { createReservationRequest } from "@/lib/reservation-service";
import {
  ReservationTimeRangeError,
  validateReservationTimeRange,
} from "@/lib/schedule";

import {
  addHours,
  adminId,
  nextIranHolidayDateAtHour,
  nextWorkingDateAtHour,
  poolId,
  previousWorkingDateAtHour,
  registerBusinessRuleTestHooks,
  startOfLocalDay,
  userId,
  db,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

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
  const startAt = await nextIranHolidayDateAtHour(9);
  const endAt = addHours(startAt, 1);

  await assert.rejects(
    () => validateReservationTimeRange({ startAt, endAt }),
    ReservationTimeRangeError,
  );
});

test("schedule exceptions can override official Iran holidays", async () => {
  const startAt = await nextIranHolidayDateAtHour(9);

  await db.scheduleException.create({
    data: {
      date: startOfLocalDay(startAt),
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
      reason: "Special working day.",
    },
  });

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
