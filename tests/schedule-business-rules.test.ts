import assert from "node:assert/strict";
import { test } from "node:test";

import { ScheduleExceptionSource } from "@prisma/client";

import {
  importIranHolidayScheduleExceptions,
  syncIranHolidayScheduleExceptions,
} from "@/lib/admin-settings-service";
import { getIranHolidaysForJalaliYear } from "@/lib/iran-holidays";
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

test("Iran holiday sync removes moved dates and preserves manual exceptions", async () => {
  const year = 1405;
  const holidays = await getIranHolidaysForJalaliYear(year);
  const importedHoliday = holidays[0];
  const manualHoliday = holidays[1];

  assert.ok(importedHoliday);
  assert.ok(manualHoliday);

  const holidayDates = new Set(
    holidays.map((holiday) => startOfLocalDay(holiday.date).toISOString()),
  );
  let staleImportedDate: Date | null = null;

  for (let month = 1; month <= 12 && !staleImportedDate; month += 1) {
    for (let day = 1; day <= 31; day += 1) {
      const candidate = parseJalaliDateParam(
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      );

      if (
        candidate &&
        !holidayDates.has(startOfLocalDay(candidate).toISOString())
      ) {
        staleImportedDate = startOfLocalDay(candidate);
        break;
      }
    }
  }

  assert.ok(staleImportedDate);

  const existingImported = await db.scheduleException.create({
    data: {
      date: startOfLocalDay(importedHoliday.date),
      isWorkingDay: true,
      startTime: "09:00",
      endTime: "17:00",
      reason: "Stale imported holiday",
      source: ScheduleExceptionSource.IRAN_HOLIDAY,
    },
  });
  const manualException = await db.scheduleException.create({
    data: {
      date: startOfLocalDay(manualHoliday.date),
      isWorkingDay: true,
      startTime: "10:00",
      endTime: "16:00",
      reason: "Manager correction",
      source: ScheduleExceptionSource.MANUAL,
    },
  });
  const staleImported = await db.scheduleException.create({
    data: {
      date: staleImportedDate,
      isWorkingDay: false,
      reason: "Holiday before lunar-date correction",
      source: ScheduleExceptionSource.IRAN_HOLIDAY,
    },
  });

  const result = await syncIranHolidayScheduleExceptions({ year });

  assert.equal(result.createdCount, holidays.length - 2);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.deletedCount, 1);
  assert.equal(result.preservedManualCount, 1);
  assert.equal(result.unchangedCount, 0);

  const [updatedImported, preservedManual, deletedImported] = await Promise.all([
    db.scheduleException.findUnique({ where: { id: existingImported.id } }),
    db.scheduleException.findUnique({ where: { id: manualException.id } }),
    db.scheduleException.findUnique({ where: { id: staleImported.id } }),
  ]);

  assert.equal(updatedImported?.isWorkingDay, false);
  assert.equal(updatedImported?.startTime, null);
  assert.equal(updatedImported?.endTime, null);
  assert.equal(updatedImported?.reason, importedHoliday.title);
  assert.equal(preservedManual?.reason, "Manager correction");
  assert.equal(preservedManual?.source, ScheduleExceptionSource.MANUAL);
  assert.equal(deletedImported, null);

  const auditActions = await db.auditLog.findMany({
    where: { entityId: { in: [existingImported.id, staleImported.id] } },
    orderBy: { action: "asc" },
    select: { action: true, actorUserId: true },
  });

  assert.deepEqual(
    auditActions.map((audit) => audit.action),
    ["SCHEDULE_EXCEPTION_DELETED", "SCHEDULE_EXCEPTION_UPDATED"],
  );
  assert.ok(auditActions.every((audit) => audit.actorUserId === null));

  const repeatedResult = await syncIranHolidayScheduleExceptions({ year });

  assert.equal(repeatedResult.createdCount, 0);
  assert.equal(repeatedResult.updatedCount, 0);
  assert.equal(repeatedResult.deletedCount, 0);
  assert.equal(repeatedResult.preservedManualCount, 1);
  assert.equal(repeatedResult.unchangedCount, holidays.length - 1);
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
