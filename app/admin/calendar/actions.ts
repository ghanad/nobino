"use server";

import {
  CalendarDayOverrideMode,
  CalendarDayTargetType,
  UserRole,
} from "@prisma/client";
import { z } from "zod";

import {
  createCalendarDayOverride,
  deleteCalendarDayOverride,
  GLOBAL_CALENDAR_TARGET_KEY,
  updateCalendarDayOverride,
  type CalendarDayOverrideTargetInput,
} from "@/lib/calendar-day-override-service";
import { requireRole } from "@/lib/auth";
import {
  isValidJalaliDateParam,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import {
  checkboxToBoolean,
  emptyToUndefined,
  getActionErrorMessage,
  redirectToPath,
} from "@/app/admin/_actions/shared";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):00$/).optional();
const formSchema = z.object({
  endTime: timeSchema,
  lunch: z.boolean(),
  mode: z.nativeEnum(CalendarDayOverrideMode),
  officeIds: z.array(z.string().min(1)),
  reason: z.string().trim().max(200).optional(),
  roomIds: z.array(z.string().min(1)),
  startTime: timeSchema,
  systems: z.boolean(),
});

function parseForm(formData: FormData) {
  return formSchema.safeParse({
    endTime: emptyToUndefined(formData.get("endTime")),
    lunch: checkboxToBoolean(formData.get("lunch")),
    mode: formData.get("mode"),
    officeIds: formData.getAll("officeIds"),
    reason: emptyToUndefined(formData.get("reason")),
    roomIds: formData.getAll("roomIds"),
    startTime: emptyToUndefined(formData.get("startTime")),
    systems: checkboxToBoolean(formData.get("systems")),
  });
}

function buildTargets(input: z.infer<typeof formSchema>) {
  const targets: CalendarDayOverrideTargetInput[] = [];

  if (input.systems) {
    targets.push({
      targetKey: GLOBAL_CALENDAR_TARGET_KEY,
      type: CalendarDayTargetType.SYSTEMS,
    });
  }

  if (input.lunch) {
    targets.push({
      targetKey: GLOBAL_CALENDAR_TARGET_KEY,
      type: CalendarDayTargetType.LUNCH,
    });
  }

  targets.push(
    ...input.officeIds.map((targetKey) => ({
      targetKey,
      type: CalendarDayTargetType.OFFICE,
    })),
    ...input.roomIds.map((targetKey) => ({
      targetKey,
      type: CalendarDayTargetType.MEETING_ROOM,
    })),
  );

  return targets;
}

export async function createCalendarDayOverrideAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = parseForm(formData);
  const dateValue = formData.get("date");

  if (
    !parsed.success ||
    typeof dateValue !== "string" ||
    !isValidJalaliDateParam(dateValue)
  ) {
    redirectToPath("/admin/calendar", {
      error: "تاریخ، حالت و محدوده اصلاح تقویم را معتبر وارد کنید.",
    });
  }

  const date = parseJalaliDateParam(dateValue);

  if (!date) {
    redirectToPath("/admin/calendar", {
      error: "تاریخ جلالی معتبری وارد کنید.",
    });
  }

  try {
    await createCalendarDayOverride({
      adminId: admin.id,
      date,
      endTime: parsed.data.endTime,
      mode: parsed.data.mode,
      reason: parsed.data.reason,
      startTime: parsed.data.startTime,
      targets: buildTargets(parsed.data),
    });
  } catch (error) {
    redirectToPath("/admin/calendar", {
      error: getActionErrorMessage(error),
    });
  }

  redirectToPath("/admin/calendar", { created: "1" });
}

export async function updateCalendarDayOverrideAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = parseForm(formData);
  const overrideId = formData.get("overrideId");

  if (
    !parsed.success ||
    typeof overrideId !== "string" ||
    !overrideId
  ) {
    redirectToPath("/admin/calendar", {
      error: "اطلاعات اصلاح تقویم معتبر نیست.",
    });
  }

  try {
    await updateCalendarDayOverride({
      adminId: admin.id,
      endTime: parsed.data.endTime,
      mode: parsed.data.mode,
      overrideId,
      reason: parsed.data.reason,
      startTime: parsed.data.startTime,
      targets: buildTargets(parsed.data),
    });
  } catch (error) {
    redirectToPath("/admin/calendar", {
      error: getActionErrorMessage(error),
    });
  }

  redirectToPath("/admin/calendar", { updated: "1" });
}

export async function deleteCalendarDayOverrideAction(formData: FormData) {
  const admin = await requireRole([UserRole.ADMIN]);
  const overrideId = formData.get("overrideId");

  if (typeof overrideId !== "string" || !overrideId) {
    redirectToPath("/admin/calendar", {
      error: "اصلاح تقویم معتبری انتخاب کنید.",
    });
  }

  try {
    await deleteCalendarDayOverride({
      adminId: admin.id,
      overrideId,
    });
  } catch (error) {
    redirectToPath("/admin/calendar", {
      error: getActionErrorMessage(error),
    });
  }

  redirectToPath("/admin/calendar", { deleted: "1" });
}
