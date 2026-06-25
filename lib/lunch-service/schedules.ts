import "server-only";

import { db } from "@/lib/db";

import { assertAdmin, LunchReservationError } from "./shared";

export async function updateLunchWeeklySchedule(input: {
  adminId: string;
  scheduleId: string;
  isServiceDay: boolean;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchWeeklySchedule.findUnique({
      where: { id: input.scheduleId },
    });

    if (!current) {
      throw new LunchReservationError("روز برنامه هفتگی پیدا نشد.");
    }

    const updated = await tx.lunchWeeklySchedule.update({
      where: { id: current.id },
      data: { isServiceDay: input.isServiceDay },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchWeeklySchedule",
        entityId: updated.id,
        action: "LUNCH_WEEKLY_SCHEDULE_CHANGED",
        oldValue: {
          dayOfWeek: current.dayOfWeek,
          isServiceDay: current.isServiceDay,
        },
        newValue: {
          dayOfWeek: updated.dayOfWeek,
          isServiceDay: updated.isServiceDay,
        },
      },
    });

    return updated;
  });
}
