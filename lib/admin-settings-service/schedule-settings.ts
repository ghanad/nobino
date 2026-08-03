import "server-only";

import { ScheduleExceptionSource } from "@prisma/client";

import { db } from "@/lib/db";
import { getIranHolidaysForJalaliYear } from "@/lib/iran-holidays";

import { assertWorkingHours, startOfLocalDay } from "./date-time";
import { AdminSettingsError, assertAdmin } from "./shared";

type WeeklyScheduleUpdate = {
  scheduleId: string;
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
};

export async function updateWeeklySchedules(input: {
  adminId: string;
  schedules: WeeklyScheduleUpdate[];
}) {
  const scheduleIds = input.schedules.map((schedule) => schedule.scheduleId);
  const uniqueScheduleIds = new Set(scheduleIds);
  const updates = input.schedules.map((schedule) => ({
    ...schedule,
    workingHours: assertWorkingHours(
      schedule,
      (message) => new AdminSettingsError(message),
    ),
  }));

  if (
    input.schedules.length !== 7 ||
    uniqueScheduleIds.size !== input.schedules.length
  ) {
    throw new AdminSettingsError("Weekly schedule settings are incomplete.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const currentSchedules = await tx.workingSchedule.findMany({
      where: { id: { in: scheduleIds } },
    });

    if (currentSchedules.length !== input.schedules.length) {
      throw new AdminSettingsError("A weekly schedule row was not found.");
    }

    const currentById = new Map(
      currentSchedules.map((schedule) => [schedule.id, schedule]),
    );
    const updatedSchedules = [];

    for (const update of updates) {
      const current = currentById.get(update.scheduleId)!;
      const updated = await tx.workingSchedule.update({
        where: { id: current.id },
        data: {
          isWorkingDay: update.isWorkingDay,
          startTime: update.workingHours.startTime ?? current.startTime,
          endTime: update.workingHours.endTime ?? current.endTime,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: input.adminId,
          entityType: "WorkingSchedule",
          entityId: updated.id,
          action: "WORKING_SCHEDULE_CHANGED",
          oldValue: {
            dayOfWeek: current.dayOfWeek,
            isWorkingDay: current.isWorkingDay,
            startTime: current.startTime,
            endTime: current.endTime,
          },
          newValue: {
            dayOfWeek: updated.dayOfWeek,
            isWorkingDay: updated.isWorkingDay,
            startTime: updated.startTime,
            endTime: updated.endTime,
          },
        },
      });

      updatedSchedules.push(updated);
    }

    return updatedSchedules;
  });
}

export async function createScheduleException(input: {
  adminId: string;
  date: Date;
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}) {
  const workingHours = assertWorkingHours(
    input,
    (message) => new AdminSettingsError(message),
  );
  const exceptionDate = startOfLocalDay(input.date);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const existing = await tx.scheduleException.findFirst({
      where: { date: exceptionDate },
      select: { id: true },
    });

    if (existing) {
      throw new AdminSettingsError(
        "A schedule exception already exists for this date.",
      );
    }

    const exception = await tx.scheduleException.create({
      data: {
        date: exceptionDate,
        isWorkingDay: input.isWorkingDay,
        startTime: workingHours.startTime,
        endTime: workingHours.endTime,
        reason: input.reason?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "ScheduleException",
        entityId: exception.id,
        action: "SCHEDULE_EXCEPTION_CREATED",
        newValue: {
          date: exception.date.toISOString(),
          isWorkingDay: exception.isWorkingDay,
          startTime: exception.startTime,
          endTime: exception.endTime,
          reason: exception.reason,
        },
      },
    });

    return exception;
  });
}

type ScheduleExceptionUpdate = {
  exceptionId: string;
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
};

export async function updateScheduleExceptions(input: {
  adminId: string;
  exceptions: ScheduleExceptionUpdate[];
}) {
  const exceptionIds = input.exceptions.map(
    (exception) => exception.exceptionId,
  );
  const uniqueExceptionIds = new Set(exceptionIds);
  const updates = input.exceptions.map((exception) => ({
    ...exception,
    workingHours: assertWorkingHours(
      exception,
      (message) => new AdminSettingsError(message),
    ),
  }));

  if (uniqueExceptionIds.size !== input.exceptions.length) {
    throw new AdminSettingsError("Schedule exception settings are invalid.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const currentExceptions = await tx.scheduleException.findMany({
      where: { id: { in: exceptionIds } },
    });

    if (currentExceptions.length !== input.exceptions.length) {
      throw new AdminSettingsError("A schedule exception was not found.");
    }

    const currentById = new Map(
      currentExceptions.map((exception) => [exception.id, exception]),
    );
    const updatedExceptions = [];

    for (const update of updates) {
      const current = currentById.get(update.exceptionId)!;
      const updated = await tx.scheduleException.update({
        where: { id: current.id },
        data: {
          isWorkingDay: update.isWorkingDay,
          startTime: update.workingHours.startTime,
          endTime: update.workingHours.endTime,
          reason: update.reason?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: input.adminId,
          entityType: "ScheduleException",
          entityId: updated.id,
          action: "SCHEDULE_EXCEPTION_UPDATED",
          oldValue: {
            date: current.date.toISOString(),
            isWorkingDay: current.isWorkingDay,
            startTime: current.startTime,
            endTime: current.endTime,
            reason: current.reason,
          },
          newValue: {
            date: updated.date.toISOString(),
            isWorkingDay: updated.isWorkingDay,
            startTime: updated.startTime,
            endTime: updated.endTime,
            reason: updated.reason,
          },
        },
      });

      updatedExceptions.push(updated);
    }

    return updatedExceptions;
  });
}

export async function deleteScheduleException(input: {
  adminId: string;
  exceptionId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.scheduleException.findUnique({
      where: { id: input.exceptionId },
    });

    if (!current) {
      throw new AdminSettingsError("Schedule exception was not found.");
    }

    await tx.scheduleException.delete({
      where: { id: current.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "ScheduleException",
        entityId: current.id,
        action: "SCHEDULE_EXCEPTION_DELETED",
        oldValue: {
          date: current.date.toISOString(),
          isWorkingDay: current.isWorkingDay,
          startTime: current.startTime,
          endTime: current.endTime,
          reason: current.reason,
        },
      },
    });
  });
}

export async function importIranHolidayScheduleExceptions(input: {
  adminId: string;
  year: number;
}) {
  if (input.year < 1300 || input.year > 1600) {
    throw new AdminSettingsError("Enter a valid Jalali year.");
  }

  const holidays = await getIranHolidaysForJalaliYear(input.year);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const existingExceptions = await tx.scheduleException.findMany({
      where: {
        date: {
          in: holidays.map((holiday) => startOfLocalDay(holiday.date)),
        },
      },
      select: { date: true },
    });
    const existingDates = new Set(
      existingExceptions.map((exception) => exception.date.toISOString()),
    );
    let createdCount = 0;

    for (const holiday of holidays) {
      const date = startOfLocalDay(holiday.date);

      if (existingDates.has(date.toISOString())) {
        continue;
      }

      const exception = await tx.scheduleException.create({
        data: {
          date,
          isWorkingDay: false,
          startTime: null,
          endTime: null,
          reason: holiday.title,
          source: ScheduleExceptionSource.IRAN_HOLIDAY,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: input.adminId,
          entityType: "ScheduleException",
          entityId: exception.id,
          action: "SCHEDULE_EXCEPTION_CREATED",
          newValue: {
            date: exception.date.toISOString(),
            importedFrom: "iran_holidays",
            isWorkingDay: exception.isWorkingDay,
            startTime: exception.startTime,
            endTime: exception.endTime,
            reason: exception.reason,
          },
        },
      });

      createdCount += 1;
    }

    return {
      createdCount,
      skippedCount: holidays.length - createdCount,
      totalCount: holidays.length,
    };
  });
}
