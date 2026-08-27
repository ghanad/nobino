import "server-only";

import { syncIranHolidayScheduleExceptions } from "@/lib/admin-settings-service";
import { db } from "@/lib/db";
import { formatJalaliDateParam } from "@/lib/jalali-date";

const JOB_ENTITY_ID = "iran-holiday-schedule-sync";
const JOB_ENTITY_TYPE = "MaintenanceJob";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ERROR_LENGTH = 500;

type SyncYear = typeof syncIranHolidayScheduleExceptions;
type YearSyncResult = Awaited<ReturnType<SyncYear>>;

export type ScheduledIranHolidaySyncResult =
  | {
      lastSucceededAt: Date;
      nextEligibleAt: Date;
      status: "not_due";
    }
  | {
      nextEligibleAt: Date;
      status: "synchronized";
      years: Array<{ result: YearSyncResult; year: number }>;
    };

function getErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown Iran holiday sync error";

  return message.slice(0, MAX_ERROR_LENGTH);
}

export async function runScheduledIranHolidaySyncIfDue(
  now: Date = new Date(),
  syncYear: SyncYear = syncIranHolidayScheduleExceptions,
): Promise<ScheduledIranHolidaySyncResult> {
  const lastSuccess = await db.auditLog.findFirst({
    where: {
      action: "IRAN_HOLIDAY_SYNC_SUCCEEDED",
      entityId: JOB_ENTITY_ID,
      entityType: JOB_ENTITY_TYPE,
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (lastSuccess) {
    const nextEligibleAt = new Date(lastSuccess.createdAt.getTime() + WEEK_MS);

    if (now < nextEligibleAt) {
      return {
        lastSucceededAt: lastSuccess.createdAt,
        nextEligibleAt,
        status: "not_due",
      };
    }
  }

  const currentJalaliYear = Number(
    formatJalaliDateParam(now).slice(0, 4),
  );
  const targetYears = [currentJalaliYear, currentJalaliYear + 1];

  await db.auditLog.create({
    data: {
      action: "IRAN_HOLIDAY_SYNC_STARTED",
      actorUserId: null,
      createdAt: now,
      entityId: JOB_ENTITY_ID,
      entityType: JOB_ENTITY_TYPE,
      newValue: { targetYears },
    },
  });

  try {
    const years: Array<{ result: YearSyncResult; year: number }> = [];

    for (const year of targetYears) {
      years.push({ result: await syncYear({ year }), year });
    }

    const nextEligibleAt = new Date(now.getTime() + WEEK_MS);

    await db.auditLog.create({
      data: {
        action: "IRAN_HOLIDAY_SYNC_SUCCEEDED",
        actorUserId: null,
        createdAt: now,
        entityId: JOB_ENTITY_ID,
        entityType: JOB_ENTITY_TYPE,
        newValue: { nextEligibleAt: nextEligibleAt.toISOString(), years },
      },
    });

    return { nextEligibleAt, status: "synchronized", years };
  } catch (error) {
    await db.auditLog.create({
      data: {
        action: "IRAN_HOLIDAY_SYNC_FAILED",
        actorUserId: null,
        createdAt: now,
        entityId: JOB_ENTITY_ID,
        entityType: JOB_ENTITY_TYPE,
        newValue: { error: getErrorMessage(error), targetYears },
      },
    });

    throw error;
  }
}
