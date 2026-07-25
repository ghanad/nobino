"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import {
  createScheduleException,
  deleteScheduleException,
  importIranHolidayScheduleExceptions,
  updateScheduleExceptions,
  updateWeeklySchedules,
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

const weeklyScheduleRowSchema = z.object({
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

const updateExceptionRowSchema = createExceptionSchema
  .omit({ date: true })
  .extend({
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
  const parsed = z.array(weeklyScheduleRowSchema).length(7).safeParse(
    Array.from({ length: 7 }, (_, index) => ({
      scheduleId: formData.get(`schedules.${index}.scheduleId`),
      isWorkingDay: checkboxToBoolean(
        formData.get(`schedules.${index}.isWorkingDay`),
      ),
      startTime: emptyToUndefined(
        formData.get(`schedules.${index}.startTime`),
      ),
      endTime: emptyToUndefined(formData.get(`schedules.${index}.endTime`)),
    })),
  );

  if (!parsed.success) {
    redirectToAdmin({
      error: "ساعت‌های برنامه را دقیقاً روی ابتدای ساعت وارد کنید.",
      tab: "schedule",
      view: "weekly",
    });
  }

  try {
    await updateWeeklySchedules({
      adminId: admin.id,
      schedules: parsed.data,
    });
  } catch (error) {
    redirectToAdmin({
      error: getActionErrorMessage(error),
      tab: "schedule",
      view: "weekly",
    });
  }

  redirectToAdmin({
    scheduleUpdated: "1",
    tab: "schedule",
    view: "weekly",
  });
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
      error: "تاریخ جلالی و ساعت‌های استثنا را معتبر وارد کنید.",
      tab: "schedule",
      view: "exceptions",
    });
  }

  const date = parseJalaliDateParam(parsed.data.date);

  if (!date) {
    redirectToAdmin({
      error: "تاریخ جلالی معتبری وارد کنید.",
      tab: "schedule",
      view: "exceptions",
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
    redirectToAdmin({
      error: getActionErrorMessage(error),
      tab: "schedule",
      view: "exceptions",
    });
  }

  redirectToAdmin({
    exceptionCreated: "1",
    tab: "schedule",
    view: "exceptions",
  });
}

export async function updateScheduleExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const count = z.coerce
    .number()
    .int()
    .min(0)
    .max(500)
    .safeParse(formData.get("exceptionCount"));

  if (!count.success) {
    redirectToAdmin({
      error: "فهرست استثناها معتبر نیست.",
      tab: "schedule",
      view: "exceptions",
    });
  }

  const parsed = z.array(updateExceptionRowSchema).length(count.data).safeParse(
    Array.from({ length: count.data }, (_, index) => ({
      exceptionId: formData.get(`exceptions.${index}.exceptionId`),
      isWorkingDay: checkboxToBoolean(
        formData.get(`exceptions.${index}.isWorkingDay`),
      ),
      startTime: emptyToUndefined(
        formData.get(`exceptions.${index}.startTime`),
      ),
      endTime: emptyToUndefined(formData.get(`exceptions.${index}.endTime`)),
      reason: emptyToUndefined(formData.get(`exceptions.${index}.reason`)),
    })),
  );

  if (!parsed.success) {
    redirectToAdmin({
      error: "اطلاعات و ساعت‌های استثناها معتبر نیست.",
      tab: "schedule",
      view: "exceptions",
    });
  }

  try {
    await updateScheduleExceptions({
      adminId: admin.id,
      exceptions: parsed.data,
    });
  } catch (error) {
    redirectToAdmin({
      error: getActionErrorMessage(error),
      tab: "schedule",
      view: "exceptions",
    });
  }

  redirectToAdmin({
    exceptionUpdated: "1",
    tab: "schedule",
    view: "exceptions",
  });
}

export async function deleteScheduleExceptionAction(
  exceptionId: string,
  formData: FormData,
): Promise<void> {
  void formData;
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = deleteExceptionSchema.safeParse({
    exceptionId,
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "یک استثنای معتبر برای حذف انتخاب کنید.",
      tab: "schedule",
      view: "exceptions",
    });
  }

  try {
    await deleteScheduleException({
      adminId: admin.id,
      exceptionId: parsed.data.exceptionId,
    });
  } catch (error) {
    redirectToAdmin({
      error: getActionErrorMessage(error),
      tab: "schedule",
      view: "exceptions",
    });
  }

  redirectToAdmin({
    exceptionDeleted: "1",
    tab: "schedule",
    view: "exceptions",
  });
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
      error: "سال جلالی معتبری وارد کنید.",
      tab: "schedule",
      view: "exceptions",
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
    redirectToAdmin({
      error: getActionErrorMessage(error),
      tab: "schedule",
      view: "exceptions",
    });
  }

  redirectToAdmin({
    holidayImported: String(createdCount),
    tab: "schedule",
    view: "exceptions",
  });
}
