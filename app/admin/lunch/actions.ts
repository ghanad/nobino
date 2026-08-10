"use server";

import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import {
  buildLocalDateAtHourFromJalali,
  isValidJalaliDateParam,
} from "@/lib/jalali-date";
import {
  createLunchException,
  deleteLunchException,
  LunchReservationError,
  updateLunchException,
  updateLunchSettings,
  updateLunchWeeklySchedule,
} from "@/lib/lunch-service";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);

const settingsSchema = z.object({
  enabled: z.coerce.boolean(),
  maxAdvanceDays: z.coerce.number().int().min(1).max(31),
  cutoffTime: timeSchema,
});

const weeklyScheduleSchema = z.object({
  scheduleId: z.string().min(1),
  isServiceDay: z.coerce.boolean(),
});

const createExceptionSchema = z.object({
  date: z.string().refine(isValidJalaliDateParam),
  isServiceDay: z.coerce.boolean(),
  reason: z.string().trim().max(200).optional(),
});

const updateExceptionSchema = createExceptionSchema.omit({ date: true }).extend({
  exceptionId: z.string().min(1),
});

const deleteExceptionSchema = z.object({
  exceptionId: z.string().min(1),
});

function checkboxToBoolean(value: FormDataEntryValue | null): boolean {
  return value === "on";
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() || undefined;
}

function redirectToLunchAdmin(
  params: Record<string, string | undefined>,
): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  redirect(query ? `/admin/lunch?${query}` : "/admin/lunch");
}

function getActionErrorMessage(error: unknown): string {
  if (error instanceof LunchReservationError) {
    return error.message;
  }

  throw error;
}

export async function updateLunchSettingsAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = settingsSchema.safeParse({
    enabled: checkboxToBoolean(formData.get("enabled")),
    maxAdvanceDays: formData.get("maxAdvanceDays"),
    cutoffTime: formData.get("cutoffTime"),
  });

  if (!parsed.success) {
    redirectToLunchAdmin({ error: "تنظیمات غذا معتبر نیست." });
  }

  try {
    await updateLunchSettings({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToLunchAdmin({ error: getActionErrorMessage(error) });
  }

  redirectToLunchAdmin({ settingsUpdated: "1" });
}

export async function updateLunchWeeklyScheduleAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = weeklyScheduleSchema.safeParse({
    scheduleId: formData.get("scheduleId"),
    isServiceDay: checkboxToBoolean(formData.get("isServiceDay")),
  });

  if (!parsed.success) {
    redirectToLunchAdmin({ error: "روز برنامه هفتگی معتبر نیست." });
  }

  try {
    await updateLunchWeeklySchedule({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToLunchAdmin({ error: getActionErrorMessage(error) });
  }

  redirectToLunchAdmin({ weeklyUpdated: "1" });
}

export async function createLunchExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = createExceptionSchema.safeParse({
    date: formData.get("date"),
    isServiceDay: checkboxToBoolean(formData.get("isServiceDay")),
    reason: emptyToUndefined(formData.get("reason")),
  });

  if (!parsed.success) {
    redirectToLunchAdmin({ error: "استثنای غذا معتبر نیست." });
  }

  try {
    await createLunchException({
      adminId: admin.id,
      date: buildLocalDateAtHourFromJalali(parsed.data.date, 0),
      isServiceDay: parsed.data.isServiceDay,
      reason: parsed.data.reason,
    });
  } catch (error) {
    redirectToLunchAdmin({ error: getActionErrorMessage(error) });
  }

  redirectToLunchAdmin({ exceptionCreated: "1" });
}

export async function updateLunchExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = updateExceptionSchema.safeParse({
    exceptionId: formData.get("exceptionId"),
    isServiceDay: checkboxToBoolean(formData.get("isServiceDay")),
    reason: emptyToUndefined(formData.get("reason")),
  });

  if (!parsed.success) {
    redirectToLunchAdmin({ error: "استثنای غذا معتبر نیست." });
  }

  try {
    await updateLunchException({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToLunchAdmin({ error: getActionErrorMessage(error) });
  }

  redirectToLunchAdmin({ exceptionUpdated: "1" });
}

export async function deleteLunchExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = deleteExceptionSchema.safeParse({
    exceptionId: formData.get("exceptionId"),
  });

  if (!parsed.success) {
    redirectToLunchAdmin({ error: "استثنای غذا معتبر نیست." });
  }

  try {
    await deleteLunchException({
      adminId: admin.id,
      exceptionId: parsed.data.exceptionId,
    });
  } catch (error) {
    redirectToLunchAdmin({ error: getActionErrorMessage(error) });
  }

  redirectToLunchAdmin({ exceptionDeleted: "1" });
}
