"use server";

import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  AdminSettingsError,
  createCapacityException,
  createScheduleException,
  deleteCapacityException,
  deleteScheduleException,
  importIranHolidayScheduleExceptions,
  updateCapacityException,
  updateReservationPolicy,
  updateResourcePoolSettings,
  updateScheduleException,
  updateWeeklySchedule,
} from "@/lib/admin-settings-service";
import { requireRole } from "@/lib/auth";
import {
  parseJalaliDateParam,
  isValidJalaliDateParam,
} from "@/lib/jalali-date";
import {
  createManagedUser,
  resetManagedUserPassword,
  updateManagedUser,
  UserManagementError,
} from "@/lib/user-management-service";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):00$/);

const resourcePoolSchema = z.object({
  resourcePoolId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  capacity: z.coerce.number().int().min(1).max(50),
  active: z.coerce.boolean(),
});

const reservationPolicySchema = z.object({
  dailyUserHourLimit: z.coerce.number().int().min(1).max(24),
});

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

const createCapacityExceptionSchema = z.object({
  resourcePoolId: z.string().min(1),
  date: z.string().refine(isValidJalaliDateParam),
  capacity: z.coerce.number().int().min(0).max(50),
  reason: z.string().trim().max(200).optional(),
});

const updateCapacityExceptionSchema = z.object({
  capacityExceptionId: z.string().min(1),
  capacity: z.coerce.number().int().min(0).max(50),
  reason: z.string().trim().max(200).optional(),
});

const deleteCapacityExceptionSchema = z.object({
  capacityExceptionId: z.string().min(1),
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  role: z.nativeEnum(UserRole),
  password: z.string().min(8).max(200),
});

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  role: z.nativeEnum(UserRole),
  active: z.coerce.boolean(),
});

const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8).max(200),
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

function redirectToAdmin(params: Record<string, string | undefined>): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  redirect(`/admin?${searchParams.toString()}`);
}

function getActionErrorMessage(error: unknown): string {
  if (error instanceof AdminSettingsError || error instanceof UserManagementError) {
    return error.message;
  }

  throw error;
}

export async function updateResourcePoolAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = resourcePoolSchema.safeParse({
    resourcePoolId: formData.get("resourcePoolId"),
    name: formData.get("name"),
    capacity: formData.get("capacity"),
    active: checkboxToBoolean(formData.get("active")),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter a valid resource pool name and capacity.",
      tab: "capacity",
    });
  }

  try {
    await updateResourcePoolSettings({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "capacity" });
  }

  redirectToAdmin({ poolUpdated: "1", tab: "capacity" });
}

export async function updateReservationPolicyAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = reservationPolicySchema.safeParse({
    dailyUserHourLimit: formData.get("dailyUserHourLimit"),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter a valid daily user reservation limit.",
      tab: "capacity",
    });
  }

  try {
    await updateReservationPolicy({
      adminId: admin.id,
      dailyUserHourLimit: parsed.data.dailyUserHourLimit,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "capacity" });
  }

  redirectToAdmin({ reservationPolicyUpdated: "1", tab: "capacity" });
}

export async function createCapacityExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = createCapacityExceptionSchema.safeParse({
    resourcePoolId: formData.get("resourcePoolId"),
    date: formData.get("date"),
    capacity: formData.get("capacity"),
    reason: emptyToUndefined(formData.get("reason")),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter a valid resource pool, Jalali date, and capacity.",
      tab: "capacity",
    });
  }

  const date = parseJalaliDateParam(parsed.data.date);

  if (!date) {
    redirectToAdmin({
      error: "Enter a valid Jalali capacity date.",
      tab: "capacity",
    });
  }

  try {
    await createCapacityException({
      adminId: admin.id,
      resourcePoolId: parsed.data.resourcePoolId,
      date,
      capacity: parsed.data.capacity,
      reason: parsed.data.reason,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "capacity" });
  }

  redirectToAdmin({ capacityExceptionCreated: "1", tab: "capacity" });
}

export async function updateCapacityExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = updateCapacityExceptionSchema.safeParse({
    capacityExceptionId: formData.get("capacityExceptionId"),
    capacity: formData.get("capacity"),
    reason: emptyToUndefined(formData.get("reason")),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter a valid daily capacity value.",
      tab: "capacity",
    });
  }

  try {
    await updateCapacityException({
      adminId: admin.id,
      exceptionId: parsed.data.capacityExceptionId,
      capacity: parsed.data.capacity,
      reason: parsed.data.reason,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "capacity" });
  }

  redirectToAdmin({ capacityExceptionUpdated: "1", tab: "capacity" });
}

export async function deleteCapacityExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = deleteCapacityExceptionSchema.safeParse({
    capacityExceptionId: formData.get("capacityExceptionId"),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Choose a valid capacity exception to delete.",
      tab: "capacity",
    });
  }

  try {
    await deleteCapacityException({
      adminId: admin.id,
      exceptionId: parsed.data.capacityExceptionId,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "capacity" });
  }

  redirectToAdmin({ capacityExceptionDeleted: "1", tab: "capacity" });
}

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

export async function createUserAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Enter a valid user name, email, role, and temporary password.",
      tab: "users",
    });
  }

  try {
    await createManagedUser({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "users" });
  }

  redirectToAdmin({ userCreated: "1", tab: "users" });
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = updateUserSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    role: formData.get("role"),
    active: checkboxToBoolean(formData.get("active")),
  });

  if (!parsed.success) {
    redirectToAdmin({ error: "Enter valid user details.", tab: "users" });
  }

  try {
    await updateManagedUser({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "users" });
  }

  redirectToAdmin({ userUpdated: "1", tab: "users" });
}

export async function resetUserPasswordAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirectToAdmin({
      error: "Temporary password must be at least 8 characters.",
      tab: "users",
    });
  }

  try {
    await resetManagedUserPassword({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToAdmin({ error: getActionErrorMessage(error), tab: "users" });
  }

  redirectToAdmin({ passwordReset: "1", tab: "users" });
}
