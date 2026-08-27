import assert from "node:assert/strict";
import { test } from "node:test";

import { runScheduledIranHolidaySyncIfDue } from "@/lib/iran-holiday-scheduled-sync";
import { formatJalaliDateParam } from "@/lib/jalali-date";

import {
  db,
  registerBusinessRuleTestHooks,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function emptyYearSyncResult() {
  return {
    createdCount: 0,
    deletedCount: 0,
    preservedManualCount: 0,
    skippedCount: 0,
    totalCount: 0,
    unchangedCount: 0,
    updatedCount: 0,
  };
}

test("scheduled Iran holiday sync runs weekly for the current and next Jalali years", async () => {
  const now = new Date("2026-08-27T09:00:00.000Z");
  const currentYear = Number(formatJalaliDateParam(now).slice(0, 4));
  const synchronizedYears: number[] = [];
  const syncYear = async ({ year }: { year: number }) => {
    synchronizedYears.push(year);
    return emptyYearSyncResult();
  };

  const firstResult = await runScheduledIranHolidaySyncIfDue(now, syncYear);

  assert.equal(firstResult.status, "synchronized");
  assert.deepEqual(synchronizedYears, [currentYear, currentYear + 1]);

  const earlyResult = await runScheduledIranHolidaySyncIfDue(
    new Date(now.getTime() + WEEK_MS - 1),
    syncYear,
  );

  assert.equal(earlyResult.status, "not_due");
  assert.deepEqual(synchronizedYears, [currentYear, currentYear + 1]);

  const dueResult = await runScheduledIranHolidaySyncIfDue(
    new Date(now.getTime() + WEEK_MS),
    syncYear,
  );

  assert.equal(dueResult.status, "synchronized");
  assert.deepEqual(synchronizedYears, [
    currentYear,
    currentYear + 1,
    currentYear,
    currentYear + 1,
  ]);
});

test("failed scheduled Iran holiday sync is audited and retried on the next cron call", async () => {
  const now = new Date("2026-08-27T09:00:00.000Z");
  const failingSync = async () => {
    throw new Error("Calendar source unavailable");
  };

  await assert.rejects(
    runScheduledIranHolidaySyncIfDue(now, failingSync),
    /Calendar source unavailable/,
  );

  const failedAudit = await db.auditLog.findFirst({
    where: { action: "IRAN_HOLIDAY_SYNC_FAILED" },
    orderBy: { createdAt: "desc" },
  });
  const successCount = await db.auditLog.count({
    where: { action: "IRAN_HOLIDAY_SYNC_SUCCEEDED" },
  });

  assert.equal(failedAudit?.actorUserId, null);
  assert.match(JSON.stringify(failedAudit?.newValue), /Calendar source unavailable/);
  assert.equal(successCount, 0);

  const retriedYears: number[] = [];
  const retryResult = await runScheduledIranHolidaySyncIfDue(
    new Date(now.getTime() + 60 * 1000),
    async ({ year }) => {
      retriedYears.push(year);
      return emptyYearSyncResult();
    },
  );

  assert.equal(retryResult.status, "synchronized");
  assert.equal(retriedYears.length, 2);
});
