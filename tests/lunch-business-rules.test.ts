import assert from "node:assert/strict";
import { test } from "node:test";

import { LunchReservationStatus } from "@prisma/client";

import {
  cancelLunchReservationByUser,
  createLunchReservation,
  LunchReservationError,
  updateLunchReservationLocation,
} from "@/lib/lunch-service";

import {
  addDays,
  lunchLocationId,
  nextWorkingDateAtHour,
  registerBusinessRuleTestHooks,
  secondLunchLocationId,
  startOfLocalDay,
  userId,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

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
        locationId: lunchLocationId,
        date: targetDate,
        now: atCutoff,
      }),
    LunchReservationError,
  );

  await assert.rejects(
    () =>
      createLunchReservation({
        userId,
        locationId: lunchLocationId,
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

test("users cannot change or cancel their own lunch reservation at the cutoff", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const beforeCutoff = addDays(startOfLocalDay(targetDate), -1);
  beforeCutoff.setHours(12, 0, 0, 0);
  const atCutoff = addDays(startOfLocalDay(targetDate), -1);
  atCutoff.setHours(23, 59, 0, 0);

  const reservation = await createLunchReservation({
    userId,
    locationId: lunchLocationId,
    date: targetDate,
    now: beforeCutoff,
  });

  await assert.rejects(
    () =>
      updateLunchReservationLocation({
        reservationId: reservation.id,
        userId,
        locationId: secondLunchLocationId,
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
    locationId: lunchLocationId,
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
