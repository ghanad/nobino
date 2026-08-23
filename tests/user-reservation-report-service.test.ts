import assert from "node:assert/strict";
import { test } from "node:test";

import { ReservationStatus, UserRole } from "@prisma/client";

import {
  formatJalaliDateParam,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import { getUserReservationReport } from "@/lib/user-reservation-report-service";

import {
  addDays,
  addHours,
  createReservation,
  db,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

async function createTeamWithMembers(name: string, memberIds: string[]) {
  const team = await db.team.create({
    data: { name },
  });

  if (memberIds.length > 0) {
    await db.teamMembership.createMany({
      data: memberIds.map((memberId) => ({
        teamId: team.id,
        userId: memberId,
      })),
    });
  }

  return team;
}

function requireDate(value: string): Date {
  const parsed = parseJalaliDateParam(value);

  if (!parsed) {
    throw new Error(`Invalid Jalali date in test: ${value}`);
  }

  return parsed;
}

function startAtFor(jalaliDate: string, hour: number): Date {
  const date = requireDate(jalaliDate);

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    0,
    0,
    0,
  );
}

test("user report only counts approved reservations and aggregates per user", async () => {
  const approvedStartAt = startAtFor("1405-03-12", 9);

  await createReservation({
    endAt: addHours(approvedStartAt, 2),
    startAt: approvedStartAt,
    status: ReservationStatus.APPROVED,
  });
  await createReservation({
    endAt: addHours(approvedStartAt, 1),
    startAt: addHours(approvedStartAt, 3),
    status: ReservationStatus.PENDING,
  });
  await createReservation({
    userId: secondUserId,
    endAt: addHours(approvedStartAt, 1),
    startAt: addHours(approvedStartAt, 5),
    status: ReservationStatus.CANCELLED_BY_USER,
  });

  const report = await getUserReservationReport({
    date: "1405-03-01",
    period: "month",
  });

  assert.equal(report.totalApprovedHours, 2);
  assert.equal(report.totalApprovedReservationCount, 1);
  assert.equal(report.totalReservingUsers, 1);
  assert.equal(report.users.length, 1);
  assert.equal(report.users[0].id, userId);
  assert.equal(report.users[0].approvedHours, 2);
  assert.equal(report.users[0].reservationCount, 1);
});

test("user report lists every team of a user on one row without double counting", async () => {
  const firstTeam = await createTeamWithMembers("تیم اول", [userId]);
  const secondTeam = await createTeamWithMembers("تیم دوم", [userId]);
  const startAt = startAtFor("1405-03-05", 10);

  await createReservation({
    endAt: addHours(startAt, 3),
    startAt,
    status: ReservationStatus.APPROVED,
  });

  const report = await getUserReservationReport({
    date: "1405-03-01",
    period: "month",
  });
  const userRow = report.users.find((row) => row.id === userId);

  assert.equal(report.totalApprovedHours, 3);
  assert.ok(userRow);
  assert.deepEqual(userRow.teamNames, [firstTeam.name, secondTeam.name]);
  assert.equal(userRow.approvedHours, 3);
  assert.equal(userRow.reservationCount, 1);
});

test("user report marks users without a team and includes inactive users with history", async () => {
  await db.user.create({
    data: {
      active: false,
      email: "inactive@example.test",
      name: "کاربر غیرفعال",
      passwordHash: "test-password-hash",
      role: UserRole.USER,
    },
  });
  const inactiveUser = await db.user.findUniqueOrThrow({
    where: { email: "inactive@example.test" },
  });
  const startAt = startAtFor("1405-03-09", 11);

  await createReservation({
    userId: inactiveUser.id,
    endAt: addHours(startAt, 2),
    startAt,
    status: ReservationStatus.APPROVED,
  });
  await createReservation({
    userId: secondUserId,
    endAt: addHours(startAt, 1),
    startAt,
    status: ReservationStatus.APPROVED,
  });

  const report = await getUserReservationReport({
    date: "1405-03-01",
    period: "month",
  });
  const inactiveRow = report.users.find((row) => row.id === inactiveUser.id);
  const secondRow = report.users.find((row) => row.id === secondUserId);

  assert.ok(inactiveRow);
  assert.deepEqual(inactiveRow.teamNames, ["بدون تیم"]);
  assert.ok(secondRow);
  assert.deepEqual(secondRow.teamNames, ["بدون تیم"]);
  assert.equal(report.users.length, 2);
  assert.equal(report.totalReservingUsers, 2);
});

test("user report sorts by approved hours then keeps rows per user", async () => {
  const startAt = startAtFor("1405-03-09", 9);

  await createReservation({
    userId: secondUserId,
    endAt: addHours(startAt, 4),
    startAt,
    status: ReservationStatus.APPROVED,
  });

  const secondDayStartAt = addDays(startAt, 1);
  await createReservation({
    endAt: addHours(secondDayStartAt, 2),
    startAt: secondDayStartAt,
    status: ReservationStatus.APPROVED,
  });
  await createReservation({
    endAt: addHours(secondDayStartAt, 1),
    startAt: addHours(secondDayStartAt, 3),
    status: ReservationStatus.PENDING,
  });

  const report = await getUserReservationReport({
    date: "1405-03-12",
    period: "week",
  });

  assert.equal(report.users.length, 2);
  assert.equal(report.users[0].id, secondUserId);
  assert.equal(report.users[0].approvedHours, 4);
  assert.equal(report.users[1].id, userId);
  assert.equal(report.users[1].approvedHours, 2);
});

test("user report resolves Saturday-to-Friday weeks and Jalali month boundaries", async () => {
  const midWeekDate = requireDate("1405-03-12");
  let weekStart = midWeekDate;

  while (weekStart.getDay() !== 6) {
    weekStart = addDays(weekStart, -1);
  }

  const weeklyReport = await getUserReservationReport({
    date: "1405-03-12",
    period: "week",
  });
  const monthlyReport = await getUserReservationReport({
    date: "1405-03-12",
    period: "month",
  });

  assert.equal(weeklyReport.dateParam, formatJalaliDateParam(weekStart));
  assert.equal(
    weeklyReport.nextDateParam,
    formatJalaliDateParam(addDays(weekStart, 7)),
  );
  assert.equal(monthlyReport.dateParam, "1405-03-01");
  assert.equal(monthlyReport.previousDateParam, "1405-02-01");
  assert.equal(monthlyReport.nextDateParam, "1405-04-01");
  assert.equal(monthlyReport.rangeLabel, "خرداد ۱۴۰۵");
});
