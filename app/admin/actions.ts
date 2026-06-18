"use server";

import { AnnouncementAudience, AnnouncementSeverity, UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  AnnouncementError,
  createAnnouncement,
  deactivateAnnouncement,
} from "@/lib/announcement-service";
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
  deleteManagedUser,
  resetManagedUserPassword,
  updateManagedUser,
  UserManagementError,
} from "@/lib/user-management-service";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  removeTeamMember,
  TeamError,
  updateTeam,
} from "@/lib/team-service";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):00$/);

const resourcePoolSchema = z.object({
  resourcePoolId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  capacity: z.coerce.number().int().min(1).max(50),
  active: z.coerce.boolean(),
});

const reservationPolicySchema = z.object({
  dailyUserHourLimit: z.coerce.number().int().min(1).max(24),
  oneReservationPerDayEnabled: z.coerce.boolean(),
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
  canViewLunchReport: z.coerce.boolean(),
});

const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8).max(200),
});

const deleteUserSchema = z.object({
  userId: z.string().min(1),
});

const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1200),
  severity: z.nativeEnum(AnnouncementSeverity),
  audience: z.nativeEnum(AnnouncementAudience),
  startsAt: z.string().refine(isValidJalaliDateParam),
  endsAt: z.string().optional(),
  requiresAck: z.coerce.boolean(),
});

const deactivateAnnouncementSchema = z.object({
  announcementId: z.string().min(1),
});

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const updateTeamSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
});

const deleteTeamSchema = z.object({
  teamId: z.string().min(1),
});

const addTeamMemberSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
});

const removeTeamMemberSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
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
  const sectionPath =
    params.tab === "capacity"
      ? "/admin/capacity"
      : params.tab === "schedule"
        ? "/admin/schedule"
        : "/admin";

  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "tab") {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  redirect(query ? `${sectionPath}?${query}` : sectionPath);
}

function getSafeAdminRedirectPath(
  value: FormDataEntryValue | null,
  fallback: string,
): string {
  if (
    typeof value === "string" &&
    value.startsWith("/admin") &&
    !value.startsWith("//")
  ) {
    return value;
  }

  return fallback;
}

function redirectToPath(
  path: string,
  params: Record<string, string | undefined>,
): never {
  const [pathname, existingQuery = ""] = path.split("?");
  const searchParams = new URLSearchParams(existingQuery);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  redirect(query ? `${pathname}?${query}` : pathname);
}

function getActionErrorMessage(error: unknown): string {
  if (
    error instanceof AdminSettingsError ||
    error instanceof AnnouncementError ||
    error instanceof UserManagementError ||
    error instanceof TeamError
  ) {
    return error.message;
  }

  throw error;
}

function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

function startOfNextLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    0,
    0,
    0,
    0,
  );
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
    oneReservationPerDayEnabled: checkboxToBoolean(
      formData.get("oneReservationPerDayEnabled"),
    ),
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
      oneReservationPerDayEnabled: parsed.data.oneReservationPerDayEnabled,
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
  const errorRedirectPath = getSafeAdminRedirectPath(
    formData.get("errorRedirectPath"),
    "/admin",
  );
  const successRedirectPath = getSafeAdminRedirectPath(
    formData.get("successRedirectPath"),
    "/admin",
  );
  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirectToPath(errorRedirectPath, {
      error: "Enter a valid user name, email, role, and temporary password.",
    });
  }

  try {
    await createManagedUser({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToPath(errorRedirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(successRedirectPath, { userCreated: "1" });
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin",
  );
  const parsed = updateUserSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    role: formData.get("role"),
    active: checkboxToBoolean(formData.get("active")),
    canViewLunchReport: checkboxToBoolean(formData.get("canViewLunchReport")),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, { error: "Enter valid user details." });
  }

  try {
    await updateManagedUser({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(redirectPath, { userUpdated: "1" });
}

export async function resetUserPasswordAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin",
  );
  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, {
      error: "Temporary password must be at least 8 characters.",
    });
  }

  try {
    await resetManagedUserPassword({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(redirectPath, { passwordReset: "1" });
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin",
  );
  const parsed = deleteUserSchema.safeParse({
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, { error: "Choose a valid user to delete." });
  }

  try {
    await deleteManagedUser({
      adminId: admin.id,
      ...parsed.data,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath("/admin", { userDeleted: "1" });
}

export async function createAnnouncementAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = createAnnouncementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    severity: formData.get("severity"),
    audience: formData.get("audience"),
    startsAt: formData.get("startsAt"),
    endsAt: emptyToUndefined(formData.get("endsAt")),
    requiresAck: checkboxToBoolean(formData.get("requiresAck")),
  });

  if (!parsed.success) {
    redirectToPath("/admin/announcements", {
      error: "عنوان، متن، مخاطب و تاریخ شروع معتبر وارد کنید.",
    });
  }

  const startsAt = parseJalaliDateParam(parsed.data.startsAt);
  const endsAt = parsed.data.endsAt
    ? parseJalaliDateParam(parsed.data.endsAt)
    : null;

  if (!startsAt || (parsed.data.endsAt && !endsAt)) {
    redirectToPath("/admin/announcements", {
      error: "تاریخ شروع یا پایان اعلان معتبر نیست.",
    });
  }

  try {
    await createAnnouncement({
      adminId: admin.id,
      audience: parsed.data.audience,
      body: parsed.data.body,
      endsAt: endsAt ? startOfNextLocalDay(endsAt) : null,
      requiresAck: parsed.data.requiresAck,
      severity: parsed.data.severity,
      startsAt: startOfLocalDay(startsAt),
      title: parsed.data.title,
    });
  } catch (error) {
    redirectToPath("/admin/announcements", {
      error: getActionErrorMessage(error),
    });
  }

  redirectToPath("/admin/announcements", { announcementCreated: "1" });
}

export async function deactivateAnnouncementAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = deactivateAnnouncementSchema.safeParse({
    announcementId: formData.get("announcementId"),
  });

  if (!parsed.success) {
    redirectToPath("/admin/announcements", {
      error: "اعلان معتبر انتخاب نشده است.",
    });
  }

  try {
    await deactivateAnnouncement({
      adminId: admin.id,
      announcementId: parsed.data.announcementId,
    });
  } catch (error) {
    redirectToPath("/admin/announcements", {
      error: getActionErrorMessage(error),
    });
  }

  redirectToPath("/admin/announcements", { announcementDeactivated: "1" });
}

export async function createTeamAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = createTeamSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    redirectToPath("/admin/teams", {
      error: "نام تیم معتبر وارد کنید (حداکثر ۱۰۰ کاراکتر).",
    });
  }

  try {
    await createTeam({ adminId: admin.id, name: parsed.data.name });
  } catch (error) {
    redirectToPath("/admin/teams", { error: getActionErrorMessage(error) });
  }

  redirectToPath("/admin/teams", { teamCreated: "1" });
}

export async function updateTeamAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin/teams",
  );
  const parsed = updateTeamSchema.safeParse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, {
      error: "نام تیم معتبر وارد کنید (حداکثر ۱۰۰ کاراکتر).",
    });
  }

  try {
    await updateTeam({
      adminId: admin.id,
      teamId: parsed.data.teamId,
      name: parsed.data.name,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(redirectPath, { teamUpdated: "1" });
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = deleteTeamSchema.safeParse({
    teamId: formData.get("teamId"),
  });

  if (!parsed.success) {
    redirectToPath("/admin/teams", { error: "تیم معتبری انتخاب نشده است." });
  }

  try {
    await deleteTeam({ adminId: admin.id, teamId: parsed.data.teamId });
  } catch (error) {
    redirectToPath("/admin/teams", { error: getActionErrorMessage(error) });
  }

  redirectToPath("/admin/teams", { teamDeleted: "1" });
}

export async function addTeamMemberAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin/teams",
  );
  const parsed = addTeamMemberSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, { error: "کاربر معتبری انتخاب نشده است." });
  }

  try {
    await addTeamMember({
      adminId: admin.id,
      teamId: parsed.data.teamId,
      userId: parsed.data.userId,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(redirectPath, { memberAdded: "1" });
}

export async function removeTeamMemberAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const redirectPath = getSafeAdminRedirectPath(
    formData.get("redirectPath"),
    "/admin/teams",
  );
  const parsed = removeTeamMemberSchema.safeParse({
    teamId: formData.get("teamId"),
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    redirectToPath(redirectPath, { error: "عضو معتبری انتخاب نشده است." });
  }

  try {
    await removeTeamMember({
      adminId: admin.id,
      teamId: parsed.data.teamId,
      userId: parsed.data.userId,
    });
  } catch (error) {
    redirectToPath(redirectPath, { error: getActionErrorMessage(error) });
  }

  redirectToPath(redirectPath, { memberRemoved: "1" });
}
