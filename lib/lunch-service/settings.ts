import "server-only";

import { db } from "@/lib/db";

import { assertTime } from "./date-time";
import {
  assertAdmin,
  DbClient,
  DEFAULT_CUTOFF_TIME,
  DEFAULT_MAX_ADVANCE_DAYS,
  LunchReservationError,
} from "./shared";

export async function getLunchSettings(client: DbClient = db) {
  const settings = await client.lunchSettings.findUnique({
    where: { id: "default" },
  });

  return {
    id: "default",
    enabled: settings?.enabled ?? true,
    maxAdvanceDays: settings?.maxAdvanceDays ?? DEFAULT_MAX_ADVANCE_DAYS,
    cutoffTime: settings?.cutoffTime ?? DEFAULT_CUTOFF_TIME,
  };
}

export async function updateLunchSettings(input: {
  adminId: string;
  enabled: boolean;
  maxAdvanceDays: number;
  cutoffTime: string;
}) {
  if (input.maxAdvanceDays < 1 || input.maxAdvanceDays > 31) {
    throw new LunchReservationError("بازه رزرو ناهار باید بین ۱ تا ۳۱ روز باشد.");
  }

  assertTime(input.cutoffTime);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchSettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        enabled: true,
        maxAdvanceDays: DEFAULT_MAX_ADVANCE_DAYS,
        cutoffTime: DEFAULT_CUTOFF_TIME,
      },
    });

    const updated = await tx.lunchSettings.update({
      where: { id: current.id },
      data: {
        enabled: input.enabled,
        maxAdvanceDays: input.maxAdvanceDays,
        cutoffTime: input.cutoffTime,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchSettings",
        entityId: updated.id,
        action: "LUNCH_SETTINGS_CHANGED",
        oldValue: {
          enabled: current.enabled,
          maxAdvanceDays: current.maxAdvanceDays,
          cutoffTime: current.cutoffTime,
        },
        newValue: {
          enabled: updated.enabled,
          maxAdvanceDays: updated.maxAdvanceDays,
          cutoffTime: updated.cutoffTime,
        },
      },
    });

    return updated;
  });
}
