import assert from "node:assert/strict";
import { test } from "node:test";

import { ReservationStatus } from "@prisma/client";

import {
  formatJalaliDateParam,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import { getTeamReservationReport } from "@/lib/team-reservation-report-service";

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

test("team report only counts approved reservations and uses reservation hours", async () => {
  const team = await createTeamWithMembers("تیم محصول", [userId]);
  const date = requireDate("1405-03-12");
  const approvedStartAt = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    9,
    0,
    0,
    0,
  );

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
    endAt: addHours(approvedStartAt, 1),
    startAt: addHours(approvedStartAt, 5),
    status: ReservationStatus.CANCELLED_BY_USER,
  });

  const report = await getTeamReservationReport({
    date: "1405-03-01",
    period: "month",
  });
  const teamRow = report.teams.find((row) => row.name === team.name);

  assert.equal(report.totalApprovedHours, 2);
  assert.equal(report.totalApprovedReservationCount, 1);
  assert.equal(report.totalAttributedHours, 2);
  assert.ok(teamRow);
  assert.equal(teamRow.approvedHours, 2);
  assert.equal(teamRow.reservationCount, 1);
  assert.equal(teamRow.reservingUserCount, 1);
});

test("team report attributes the same approved hours to all current teams of a user", async () => {
  const firstTeam = await createTeamWithMembers("تیم اول", [userId]);
  const secondTeam = await createTeamWithMembers("تیم دوم", [userId]);
  const date = requireDate("1405-03-05");
  const startAt = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    10,
    0,
    0,
    0,
  );

  await createReservation({
    endAt: addHours(startAt, 3),
    startAt,
    status: ReservationStatus.APPROVED,
  });

  const report = await getTeamReservationReport({
    date: "1405-03-01",
    period: "month",
  });
  const firstRow = report.teams.find((row) => row.name === firstTeam.name);
  const secondRow = report.teams.find((row) => row.name === secondTeam.name);

  assert.equal(report.totalApprovedHours, 3);
  assert.equal(report.totalAttributedHours, 6);
  assert.ok(firstRow);
  assert.ok(secondRow);
  assert.equal(firstRow.approvedHours, 3);
  assert.equal(secondRow.approvedHours, 3);
  assert.equal(firstRow.reservationCount, 1);
  assert.equal(secondRow.reservationCount, 1);
});

test("team report includes users without a team under the unassigned row only when needed", async () => {
  await createTeamWithMembers("تیم پشتیبانی", [secondUserId]);
  const date = requireDate("1405-03-09");
  const startAt = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    11,
    0,
    0,
    0,
  );

  await createReservation({
    endAt: addHours(startAt, 2),
    startAt,
    status: ReservationStatus.APPROVED,
  });

  const report = await getTeamReservationReport({
    date: "1405-03-01",
    period: "month",
  });
  const unassignedRow = report.teams.find((row) => row.name === "بدون تیم");

  assert.ok(unassignedRow);
  assert.equal(unassignedRow.approvedHours, 2);
  assert.equal(unassignedRow.reservingUserCount, 1);
  assert.equal(unassignedRow.memberCount, 0);
});

test("team report resolves Saturday-to-Friday weeks and Jalali month boundaries", async () => {
  const midWeekDate = requireDate("1405-03-12");
  let weekStart = midWeekDate;

  while (weekStart.getDay() !== 6) {
    weekStart = addDays(weekStart, -1);
  }

  const weeklyReport = await getTeamReservationReport({
    date: "1405-03-12",
    period: "week",
  });
  const monthlyReport = await getTeamReservationReport({
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
