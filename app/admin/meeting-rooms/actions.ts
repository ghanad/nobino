"use server";

import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import {
  createMeetingRoom,
  createMeetingRoomScheduleException,
  deleteMeetingRoom,
  deleteMeetingRoomScheduleException,
  setMeetingRoomActiveStatus,
  updateMeetingRoom,
  updateMeetingRoomScheduleException,
  updateMeetingRoomWeeklySchedule,
} from "@/lib/meeting-room-admin-service";
import {
  isValidJalaliDateParam,
  parseJalaliDateParam,
} from "@/lib/jalali-date";
import { AdminSettingsError } from "@/lib/admin-settings-service/shared";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):00$/);

const roomSchema = z.object({
  roomId: z.string().optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).optional(),
  location: z.string().trim().max(120).optional(),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
  autoApprovalEnabled: z.coerce.boolean(),
  autoApprovalDelayHours: z.coerce.number().int().min(1).max(24),
});

const weeklyScheduleSchema = z.object({
  scheduleId: z.string().min(1),
  roomId: z.string().optional(),
  isWorkingDay: z.coerce.boolean(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
});

const exceptionCreateSchema = z.object({
  roomId: z.string().min(1),
  date: z.string().refine(isValidJalaliDateParam),
  isWorkingDay: z.coerce.boolean(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  reason: z.string().trim().max(200).optional(),
});

const exceptionUpdateSchema = exceptionCreateSchema
  .omit({ date: true, roomId: true })
  .extend({
    exceptionId: z.string().min(1),
    roomId: z.string().optional(),
  });

const exceptionDeleteSchema = z.object({
  exceptionId: z.string().min(1),
  roomId: z.string().optional(),
});

const roomDeleteSchema = z.object({ roomId: z.string().min(1) });
const roomActiveStatusSchema = z.object({
  roomId: z.string().min(1),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

function checkboxToBoolean(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

function emptyToUndefined(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";

  return text || undefined;
}

function getFormString(formData: FormData, name: string) {
  return emptyToUndefined(formData.get(name));
}

function getActionErrorMessage(error: unknown): string {
  if (error instanceof AdminSettingsError) {
    return error.message;
  }

  throw error;
}

function redirectToAdminMeetingRooms(
  params: Record<string, string | undefined>,
): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  redirect(`/admin/meeting-rooms?${searchParams.toString()}`);
}

export async function createMeetingRoomAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = roomSchema.safeParse({
    name: formData.get("name"),
    description: emptyToUndefined(formData.get("description")),
    location: emptyToUndefined(formData.get("location")),
    isActive: checkboxToBoolean(formData.get("isActive")),
    sortOrder: formData.get("sortOrder"),
    autoApprovalEnabled: checkboxToBoolean(formData.get("autoApprovalEnabled")),
    autoApprovalDelayHours: formData.get("autoApprovalDelayHours"),
  });

  if (!parsed.success) {
    redirectToAdminMeetingRooms({
      error: "مشخصات اتاق جلسه و مدت تأیید خودکار را معتبر وارد کنید.",
      view: "new",
    });
  }

  try {
    const room = await createMeetingRoom({ adminId: admin.id, ...parsed.data });
    redirectToAdminMeetingRooms({
      roomCreated: "1",
      roomId: room.id,
      view: "details",
    });
  } catch (error) {
    redirectToAdminMeetingRooms({
      error: getActionErrorMessage(error),
      view: "new",
    });
  }
}

export async function updateMeetingRoomAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = roomSchema.required({ roomId: true }).safeParse({
    roomId: formData.get("roomId"),
    name: formData.get("name"),
    description: emptyToUndefined(formData.get("description")),
    location: emptyToUndefined(formData.get("location")),
    isActive: checkboxToBoolean(formData.get("isActive")),
    sortOrder: formData.get("sortOrder"),
    autoApprovalEnabled: checkboxToBoolean(formData.get("autoApprovalEnabled")),
    autoApprovalDelayHours: formData.get("autoApprovalDelayHours"),
  });

  if (!parsed.success) {
    redirectToAdminMeetingRooms({
      error: "مشخصات اتاق جلسه و مدت تأیید خودکار را معتبر وارد کنید.",
      roomId: getFormString(formData, "roomId"),
      view: "details",
    });
  }

  try {
    await updateMeetingRoom({ adminId: admin.id, ...parsed.data });
  } catch (error) {
    redirectToAdminMeetingRooms({
      error: getActionErrorMessage(error),
      roomId: parsed.data.roomId,
      view: "details",
    });
  }

  redirectToAdminMeetingRooms({
    roomId: parsed.data.roomId,
    roomUpdated: "1",
    view: "details",
  });
}

export async function deleteMeetingRoomAction(formData: FormData): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = roomDeleteSchema.safeParse({ roomId: formData.get("roomId") });

  if (!parsed.success) {
    redirectToAdminMeetingRooms({ error: "اتاق جلسه معتبر نیست." });
  }

  try {
    await deleteMeetingRoom({ adminId: admin.id, roomId: parsed.data.roomId });
  } catch (error) {
    redirectToAdminMeetingRooms({
      error: getActionErrorMessage(error),
      roomId: parsed.data.roomId,
      view: "details",
    });
  }

  redirectToAdminMeetingRooms({ roomDeleted: "1" });
}

export async function setMeetingRoomActiveStatusAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = roomActiveStatusSchema.safeParse({
    roomId: formData.get("roomId"),
    isActive: formData.get("isActive"),
  });

  if (!parsed.success) {
    redirectToAdminMeetingRooms({ error: "وضعیت اتاق جلسه معتبر نیست." });
  }

  try {
    await setMeetingRoomActiveStatus({ adminId: admin.id, ...parsed.data });
  } catch (error) {
    redirectToAdminMeetingRooms({
      error: getActionErrorMessage(error),
      roomId: parsed.data.roomId,
      view: "details",
    });
  }

  redirectToAdminMeetingRooms({
    roomId: parsed.data.roomId,
    roomUpdated: "1",
    view: "details",
  });
}

export async function updateMeetingRoomWeeklyScheduleAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = weeklyScheduleSchema.safeParse({
    scheduleId: formData.get("scheduleId"),
    roomId: formData.get("roomId") || undefined,
    isWorkingDay: checkboxToBoolean(formData.get("isWorkingDay")),
    startTime: emptyToUndefined(formData.get("startTime")),
    endTime: emptyToUndefined(formData.get("endTime")),
  });

  if (!parsed.success) {
    redirectToAdminMeetingRooms({
      error: "ساعت‌های زمان‌بندی را مثل 09:00 وارد کنید.",
      roomId: getFormString(formData, "roomId"),
      view: "schedule",
    });
  }

  try {
    await updateMeetingRoomWeeklySchedule({
      adminId: admin.id,
      scheduleId: parsed.data.scheduleId,
      isWorkingDay: parsed.data.isWorkingDay,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
    });
  } catch (error) {
    redirectToAdminMeetingRooms({
      error: getActionErrorMessage(error),
      roomId: parsed.data.roomId,
      view: "schedule",
    });
  }

  redirectToAdminMeetingRooms({
    roomId: parsed.data.roomId,
    scheduleUpdated: "1",
    view: "schedule",
  });
}

export async function createMeetingRoomScheduleExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = exceptionCreateSchema.safeParse({
    roomId: formData.get("roomId"),
    date: formData.get("date"),
    isWorkingDay: checkboxToBoolean(formData.get("isWorkingDay")),
    startTime: emptyToUndefined(formData.get("startTime")),
    endTime: emptyToUndefined(formData.get("endTime")),
    reason: emptyToUndefined(formData.get("reason")),
  });

  if (!parsed.success) {
    redirectToAdminMeetingRooms({
      error: "استثنای اتاق جلسه را معتبر وارد کنید.",
      roomId: getFormString(formData, "roomId"),
      view: "exceptions",
    });
  }

  const date = parseJalaliDateParam(parsed.data.date);

  if (!date) {
    redirectToAdminMeetingRooms({
      error: "تاریخ جلالی معتبر وارد کنید.",
      roomId: parsed.data.roomId,
      view: "exceptions",
    });
  }

  try {
    await createMeetingRoomScheduleException({
      adminId: admin.id,
      ...parsed.data,
      date,
    });
  } catch (error) {
    redirectToAdminMeetingRooms({
      error: getActionErrorMessage(error),
      roomId: parsed.data.roomId,
      view: "exceptions",
    });
  }

  redirectToAdminMeetingRooms({
    exceptionCreated: "1",
    roomId: parsed.data.roomId,
    view: "exceptions",
  });
}

export async function updateMeetingRoomScheduleExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = exceptionUpdateSchema.safeParse({
    exceptionId: formData.get("exceptionId"),
    roomId: formData.get("roomId") || undefined,
    isWorkingDay: checkboxToBoolean(formData.get("isWorkingDay")),
    startTime: emptyToUndefined(formData.get("startTime")),
    endTime: emptyToUndefined(formData.get("endTime")),
    reason: emptyToUndefined(formData.get("reason")),
  });

  if (!parsed.success) {
    redirectToAdminMeetingRooms({
      error: "استثنای اتاق جلسه را معتبر وارد کنید.",
      roomId: getFormString(formData, "roomId"),
      view: "exceptions",
    });
  }

  try {
    await updateMeetingRoomScheduleException({
      adminId: admin.id,
      exceptionId: parsed.data.exceptionId,
      isWorkingDay: parsed.data.isWorkingDay,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      reason: parsed.data.reason,
    });
  } catch (error) {
    redirectToAdminMeetingRooms({
      error: getActionErrorMessage(error),
      roomId: parsed.data.roomId,
      view: "exceptions",
    });
  }

  redirectToAdminMeetingRooms({
    exceptionUpdated: "1",
    roomId: parsed.data.roomId,
    view: "exceptions",
  });
}

export async function deleteMeetingRoomScheduleExceptionAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = exceptionDeleteSchema.safeParse({
    exceptionId: formData.get("exceptionId"),
    roomId: formData.get("roomId") || undefined,
  });

  if (!parsed.success) {
    redirectToAdminMeetingRooms({
      error: "استثنای معتبر انتخاب کنید.",
      roomId: getFormString(formData, "roomId"),
      view: "exceptions",
    });
  }

  try {
    await deleteMeetingRoomScheduleException({
      adminId: admin.id,
      exceptionId: parsed.data.exceptionId,
    });
  } catch (error) {
    redirectToAdminMeetingRooms({
      error: getActionErrorMessage(error),
      roomId: parsed.data.roomId,
      view: "exceptions",
    });
  }

  redirectToAdminMeetingRooms({
    exceptionDeleted: "1",
    roomId: parsed.data.roomId,
    view: "exceptions",
  });
}
