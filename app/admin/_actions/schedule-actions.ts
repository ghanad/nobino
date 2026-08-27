"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import {
  importIranHolidayScheduleExceptions,
  updateWeeklySchedules,
} from "@/lib/admin-settings-service";
import { requireRole } from "@/lib/auth";

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

  let syncResult = {
    createdCount: 0,
    updatedCount: 0,
    deletedCount: 0,
    preservedManualCount: 0,
  };

  try {
    const result = await importIranHolidayScheduleExceptions({
      adminId: admin.id,
      year: parsed.data.year,
    });

    syncResult = result;
  } catch (error) {
    redirectToAdmin({
      error: getActionErrorMessage(error),
      tab: "schedule",
      view: "exceptions",
    });
  }

  redirectToAdmin({
    holidayCreated: String(syncResult.createdCount),
    holidayUpdated: String(syncResult.updatedCount),
    holidayDeleted: String(syncResult.deletedCount),
    holidayManualPreserved: String(syncResult.preservedManualCount),
    tab: "schedule",
    view: "exceptions",
  });
}
