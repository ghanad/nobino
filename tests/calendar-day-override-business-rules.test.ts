import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CalendarDayOverrideMode,
  CalendarDayTargetType,
} from "@prisma/client";

import {
  createCalendarDayOverride,
  GLOBAL_CALENDAR_TARGET_KEY,
} from "@/lib/calendar-day-override-service";
import { getOfficeWorkingWindowForDate } from "@/lib/desk-schedule";
import { isLunchServiceDay } from "@/lib/lunch-service/service-days";
import { getMeetingRoomWorkingWindowForDate } from "@/lib/meeting-room-schedule";
import { getWorkingWindowForDate } from "@/lib/schedule";

import {
  adminId,
  db,
  meetingRoomId,
  nextMidweekIranHolidayDateAtHour,
  nextWorkingDateAtHour,
  officeId,
  registerBusinessRuleTestHooks,
  startOfLocalDay,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

const allTargets = [
  {
    targetKey: GLOBAL_CALENDAR_TARGET_KEY,
    type: CalendarDayTargetType.SYSTEMS,
  },
  {
    targetKey: GLOBAL_CALENDAR_TARGET_KEY,
    type: CalendarDayTargetType.LUNCH,
  },
  { targetKey: officeId, type: CalendarDayTargetType.OFFICE },
  {
    targetKey: meetingRoomId,
    type: CalendarDayTargetType.MEETING_ROOM,
  },
];

test("normal calendar correction bypasses an incorrect Iran holiday for every selected service", async () => {
  const date = await nextMidweekIranHolidayDateAtHour(10);
  await createCalendarDayOverride({
    adminId,
    date,
    mode: CalendarDayOverrideMode.NORMAL,
    reason: "Calendar source correction",
    targets: allTargets,
  });

  const [systems, lunch, office, room] = await Promise.all([
    getWorkingWindowForDate(date),
    isLunchServiceDay(date),
    getOfficeWorkingWindowForDate({ date, officeId }),
    getMeetingRoomWorkingWindowForDate({ date, roomId: meetingRoomId }),
  ]);

  assert.equal(systems.isWorkingDay, true);
  assert.equal(lunch, true);
  assert.equal(office.isWorkingDay, true);
  assert.equal(room.isWorkingDay, true);
  assert.equal(systems.startTime, "09:00");
  assert.equal(office.startTime, "09:00");
  assert.equal(room.startTime, "09:00");
});

test("closed calendar correction disables every selected service on a working date", async () => {
  const date = nextWorkingDateAtHour(10);
  await Promise.all([
    db.lunchException.deleteMany({ where: { date: startOfLocalDay(date) } }),
    db.officeScheduleException.deleteMany({
      where: { date: startOfLocalDay(date), officeId },
    }),
  ]);
  await createCalendarDayOverride({
    adminId,
    date,
    mode: CalendarDayOverrideMode.CLOSED,
    reason: "Company closure",
    targets: allTargets,
  });

  const [systems, lunch, office, room] = await Promise.all([
    getWorkingWindowForDate(date),
    isLunchServiceDay(date),
    getOfficeWorkingWindowForDate({ date, officeId }),
    getMeetingRoomWorkingWindowForDate({ date, roomId: meetingRoomId }),
  ]);

  assert.equal(systems.isWorkingDay, false);
  assert.equal(lunch, false);
  assert.equal(office.isWorkingDay, false);
  assert.equal(room.isWorkingDay, false);
});

test("custom calendar correction applies shared hours and enables lunch", async () => {
  const date = nextWorkingDateAtHour(10);
  await Promise.all([
    db.lunchException.deleteMany({ where: { date: startOfLocalDay(date) } }),
    db.officeScheduleException.deleteMany({
      where: { date: startOfLocalDay(date), officeId },
    }),
  ]);
  await createCalendarDayOverride({
    adminId,
    date,
    endTime: "14:00",
    mode: CalendarDayOverrideMode.CUSTOM,
    reason: "Short working day",
    startTime: "10:00",
    targets: allTargets,
  });

  const [systems, lunch, office, room] = await Promise.all([
    getWorkingWindowForDate(date),
    isLunchServiceDay(date),
    getOfficeWorkingWindowForDate({ date, officeId }),
    getMeetingRoomWorkingWindowForDate({ date, roomId: meetingRoomId }),
  ]);

  assert.deepEqual(
    [systems.startTime, systems.endTime],
    ["10:00", "14:00"],
  );
  assert.equal(lunch, true);
  assert.deepEqual([office.startTime, office.endTime], ["10:00", "14:00"]);
  assert.deepEqual([room.startTime, room.endTime], ["10:00", "14:00"]);
});

test("service-specific exception has priority over a central calendar correction", async () => {
  const date = nextWorkingDateAtHour(10);
  await createCalendarDayOverride({
    adminId,
    date,
    mode: CalendarDayOverrideMode.CLOSED,
    targets: allTargets,
  });
  await db.scheduleException.create({
    data: {
      date: startOfLocalDay(date),
      endTime: "16:00",
      isWorkingDay: true,
      reason: "Systems remain available",
      startTime: "10:00",
    },
  });

  const systems = await getWorkingWindowForDate(date);

  assert.equal(systems.isWorkingDay, true);
  assert.equal(systems.startTime, "10:00");
  assert.equal(systems.endTime, "16:00");
});
