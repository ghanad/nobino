"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import {
  createScheduleException,
  deleteScheduleException,
  importIranHolidayScheduleExceptions,
  updateScheduleException,
  updateWeeklySchedule,
} from "@/lib/admin-settings-service";
import { requireRole } from "@/lib/auth";
import {
  isValidJalaliDateParam,
  parseJalaliDateParam,
} from "@/lib/jalali-date";

import {
  checkboxToBoolean,
  emptyToUndefined,
  getActionErrorMessage,
  redirectToAdmin,
} from "./shared";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):00$/);

const weeklyScheduleSchema = z.object({
  scheduleId: z.string().min(1),
  isWorkingDay: z.coerce.boolean(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
});

const createExceptionSchema = z.object({
  date: z.string().refine(isValidJalaliDateParam),
  isWorkingDay: z.coerce.boolean(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  reason: z.string().trim().max(200).optional(),
});

const updateExceptionSchema = createExceptionSchema.omit({ date: true }).extend({
  exceptionId: z.string().min(1),
});

const deleteExceptionSchema = z.object({
  exceptionId: z.string().min(1),
});

const importIranHolidaysSchema = z.object({
  year: z.coerce.number().int().min(1300).max(1600),
});

export async function updateWeeklyScheduleAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = weeklyScheduleSchema.safeParse({
    scheduleId: formData.get("scheduleId"),
    isWorkingDay: checkboxToBoolean(formData.get("isWorkingDay")),
    startTime: emptyToUndefined(formData.get("startTime")),
    endTime: emptyToUndefined(formData.get("endTime")),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter exact-hour schedule times like 09:00.",
      tab: "schedule",
    });
  }

  try {
    await updateWeeklySchedule({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "schedule" });
  }

  redirectToAdmin({ scheduleUpdated: "1", tab: "schedule" });
}

export async function createScheduleExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = createExceptionSchema.safeParse({
    date: formData.get("date"),
    isWorkingDay: checkboxToBoolean(formData.get("isWorkingDay")),
    startTime: emptyToUndefined(formData.get("startTime")),
    endTime: emptyToUndefined(formData.get("endTime")),
    reason: emptyToUndefined(formData.get("reason")),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter a valid Jalali exception date and hours.",
      tab: "schedule",
    });
  }

  const date = parseJalaliDateParam(parsed.data.date);

  if (!date) {
    redirectToAdmin({
      error: "Enter a valid Jalali exception date.",
      tab: "schedule",
    });
  }

  try {
    await createScheduleException({
      adminId: admin.id,
      date,
      isWorkingDay: parsed.data.isWorkingDay,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      reason: parsed.data.reason,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "schedule" });
  }

  redirectToAdmin({ exceptionCreated: "1", tab: "schedule" });
}

export async function updateScheduleExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = updateExceptionSchema.safeParse({
    exceptionId: formData.get("exceptionId"),
    isWorkingDay: checkboxToBoolean(formData.get("isWorkingDay")),
    startTime: emptyToUndefined(formData.get("startTime")),
    endTime: emptyToUndefined(formData.get("endTime")),
    reason: emptyToUndefined(formData.get("reason")),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter valid exact-hour exception settings.",
      tab: "schedule",
    });
  }

  try {
    await updateScheduleException({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "schedule" });
  }

  redirectToAdmin({ exceptionUpdated: "1", tab: "schedule" });
}

export async function deleteScheduleExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = deleteExceptionSchema.safeParse({
    exceptionId: formData.get("exceptionId"),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Choose a valid schedule exception to delete.",
      tab: "schedule",
    });
  }

  try {
    await deleteScheduleException({
      adminId: admin.id,
      exceptionId: parsed.data.exceptionId,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "schedule" });
  }

  redirectToAdmin({ exceptionDeleted: "1", tab: "schedule" });
}

export async function importIranHolidaysAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = importIranHolidaysSchema.safeParse({
    year: formData.get("year"),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter a valid Jalali year.",
      tab: "schedule",
    });
  }

  let createdCount = 0;

  try {
    const result = await importIranHolidayScheduleExceptions({
      adminId: admin.id,
      year: parsed.data.year,
    });

    createdCount = result.createdCount;
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "schedule" });
  }

  redirectToAdmin({
    holidayImported: String(createdCount),
    tab: "schedule",
  });
}
