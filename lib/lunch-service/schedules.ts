import "server-only";

import { db } from "@/lib/db";

import { assertAdmin, LunchReservationError } from "./shared";

export async function updateLunchWeeklySchedule(input: {
  adminId: string;
  schedules: Array<{
    scheduleId: string;
    isServiceDay: boolean;
  }>;
}) {
  const scheduleIds = input.schedules.map((schedule) => schedule.scheduleId);

  if (
    input.schedules.length !== 7 ||
    new Set(scheduleIds).size !== input.schedules.length
  ) {
    throw new LunchReservationError("برنامه هفتگی غذا ناقص است.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const currentSchedules = await tx.lunchWeeklySchedule.findMany({
      where: { id: { in: scheduleIds } },
    });

    if (currentSchedules.length !== input.schedules.length) {
      throw new LunchReservationError("روز برنامه هفتگی پیدا نشد.");
    }

    const currentById = new Map(
      currentSchedules.map((schedule) => [schedule.id, schedule]),
    );

    for (const update of input.schedules) {
      const current = currentById.get(update.scheduleId);

      if (!current) {
        throw new LunchReservationError("روز برنامه هفتگی پیدا نشد.");
      }

      const updated = await tx.lunchWeeklySchedule.update({
        where: { id: current.id },
        data: { isServiceDay: update.isServiceDay },
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
    }
  });
}
