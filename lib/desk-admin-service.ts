import "server-only";

import { ReservationStatus } from "@prisma/client";

import { AdminSettingsError, assertAdmin } from "@/lib/admin-settings-service/shared";
import { db } from "@/lib/db";
import { startOfLocalDay } from "@/lib/desk-schedule";

const DEFAULT_DAYS = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  endTime: "17:00",
  isWorkingDay: dayOfWeek !== 5,
  startTime: "09:00",
}));
const EXACT_HOUR_PATTERN = /^([01]\d|2[0-3]):00$/;

export async function createOffice(input: { adminId: string; name: string; sortOrder: number }) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const office = await tx.office.create({
      data: {
        active: true,
        name: input.name.trim(),
        sortOrder: input.sortOrder,
        weeklySchedules: { create: DEFAULT_DAYS },
      },
    });
    await tx.auditLog.create({
      data: {
        action: "OFFICE_CREATED",
        actorUserId: input.adminId,
        entityId: office.id,
        entityType: "Office",
        newValue: { active: office.active, name: office.name, sortOrder: office.sortOrder },
      },
    });
    return office;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new AdminSettingsError("دفتری با این نام قبلاً ثبت شده است.");
    }
    throw error;
  });
}

export async function updateOffice(input: {
  active: boolean;
  adminId: string;
  name: string;
  officeId: string;
  sortOrder: number;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const old = await tx.office.findUnique({ where: { id: input.officeId } });
    if (!old || old.deletedAt) throw new AdminSettingsError("دفتر پیدا نشد.");
    if (!input.active && old.active) {
      const future = await tx.deskReservation.findFirst({
        where: {
          desk: { officeId: input.officeId },
          endAt: { gt: new Date() },
          status: ReservationStatus.APPROVED,
        },
        select: { id: true },
      });
      if (future) throw new AdminSettingsError("ابتدا رزروهای فعال این دفتر را لغو یا منتقل کنید.");
    }
    const updated = await tx.office.update({
      where: { id: input.officeId },
      data: { active: input.active, name: input.name.trim(), sortOrder: input.sortOrder },
    });
    await tx.auditLog.create({
      data: {
        action: "OFFICE_UPDATED", actorUserId: input.adminId, entityId: updated.id, entityType: "Office",
        oldValue: { active: old.active, name: old.name, sortOrder: old.sortOrder },
        newValue: { active: updated.active, name: updated.name, sortOrder: updated.sortOrder },
      },
    });
    return updated;
  });
}

export async function deleteOffice(input: { adminId: string; officeId: string }) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const current = await tx.office.findUnique({
      where: { id: input.officeId },
      select: { deletedAt: true, id: true, name: true },
    });
    if (!current || current.deletedAt) {
      throw new AdminSettingsError("دفتر پیدا نشد.");
    }

    const deletedAt = new Date();
    const deletedFutureReservations = await tx.deskReservation.deleteMany({
      where: {
        desk: { officeId: current.id },
        startAt: { gte: deletedAt },
      },
    });
    await tx.office.update({
      where: { id: current.id },
      data: { active: false, deletedAt },
    });
    await tx.auditLog.create({
      data: {
        action: "OFFICE_DELETED",
        actorUserId: input.adminId,
        entityId: current.id,
        entityType: "Office",
        oldValue: { name: current.name },
        newValue: {
          deletedAt: deletedAt.toISOString(),
          deletedFutureReservations: deletedFutureReservations.count,
          name: current.name,
        },
      },
    });

    return { deletedFutureReservations: deletedFutureReservations.count };
  });
}

export async function createDesk(input: { adminId: string; name: string; officeId: string; sortOrder: number }) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const office = await tx.office.findUnique({ where: { id: input.officeId }, select: { deletedAt: true, id: true } });
    if (!office || office.deletedAt) throw new AdminSettingsError("دفتر پیدا نشد.");
    const desk = await tx.desk.create({ data: { active: true, name: input.name.trim(), officeId: input.officeId, sortOrder: input.sortOrder } });
    await tx.auditLog.create({
      data: { action: "DESK_CREATED", actorUserId: input.adminId, entityId: desk.id, entityType: "Desk", newValue: { active: desk.active, name: desk.name, officeId: desk.officeId, sortOrder: desk.sortOrder } },
    });
    return desk;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes("Unique constraint")) throw new AdminSettingsError("میزی با این نام در این دفتر وجود دارد.");
    throw error;
  });
}

export async function updateDesk(input: {
  active: boolean;
  adminId: string;
  deskId: string;
  name: string;
  sortOrder: number;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const old = await tx.desk.findUnique({ where: { id: input.deskId } });
    if (!old) throw new AdminSettingsError("میز پیدا نشد.");
    if (!input.active && old.active) {
      const future = await tx.deskReservation.findFirst({
        where: { deskId: old.id, endAt: { gt: new Date() }, status: ReservationStatus.APPROVED },
        select: { id: true },
      });
      if (future) throw new AdminSettingsError("ابتدا رزروهای فعال این میز را لغو یا منتقل کنید.");
    }
    const updated = await tx.desk.update({ where: { id: old.id }, data: { active: input.active, name: input.name.trim(), sortOrder: input.sortOrder } });
    await tx.auditLog.create({
      data: {
        action: "DESK_UPDATED", actorUserId: input.adminId, entityId: updated.id, entityType: "Desk",
        oldValue: { active: old.active, name: old.name, sortOrder: old.sortOrder },
        newValue: { active: updated.active, name: updated.name, sortOrder: updated.sortOrder },
      },
    });
    return updated;
  });
}

export async function updateDeskSettings(input: {
  adminId: string;
  autoApprovalDelayHours: number;
  autoApprovalEnabled: boolean;
  maxAdvanceDays: number;
}) {
  if (
    !Number.isInteger(input.autoApprovalDelayHours) ||
    input.autoApprovalDelayHours < 1 ||
    input.autoApprovalDelayHours > 24
  ) {
    throw new AdminSettingsError("مهلت تأیید خودکار باید بین ۱ تا ۲۴ ساعت باشد.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const old = await tx.deskSettings.findUnique({ where: { id: "default" } });
    if (!input.autoApprovalEnabled) {
      await tx.deskReservation.updateMany({
        where: {
          autoApprovalAt: { not: null },
          status: ReservationStatus.PENDING,
        },
        data: { autoApprovalAt: null },
      });
    }
    const updated = await tx.deskSettings.upsert({
      where: { id: "default" },
      update: {
        autoApprovalDelayHours: input.autoApprovalDelayHours,
        autoApprovalEnabled: input.autoApprovalEnabled,
        maxAdvanceDays: input.maxAdvanceDays,
      },
      create: {
        autoApprovalDelayHours: input.autoApprovalDelayHours,
        autoApprovalEnabled: input.autoApprovalEnabled,
        id: "default",
        maxAdvanceDays: input.maxAdvanceDays,
      },
    });
    await tx.auditLog.create({ data: {
      action: "DESK_SETTINGS_UPDATED", actorUserId: input.adminId, entityId: updated.id, entityType: "DeskSettings",
      oldValue: old ? {
        autoApprovalDelayHours: old.autoApprovalDelayHours,
        autoApprovalEnabled: old.autoApprovalEnabled,
        maxAdvanceDays: old.maxAdvanceDays,
      } : undefined,
      newValue: {
        autoApprovalDelayHours: updated.autoApprovalDelayHours,
        autoApprovalEnabled: updated.autoApprovalEnabled,
        maxAdvanceDays: updated.maxAdvanceDays,
      },
    } });
    return updated;
  });
}

type OfficeWeeklyScheduleInput = {
  dayOfWeek: number;
  endTime: string;
  isWorkingDay: boolean;
  startTime: string;
};

export async function updateOfficeWeeklySchedule(input: {
  adminId: string;
  officeId: string;
  schedules: OfficeWeeklyScheduleInput[];
}) {
  const dayNumbers = new Set(input.schedules.map((schedule) => schedule.dayOfWeek));
  if (
    input.schedules.length !== 7 ||
    dayNumbers.size !== 7 ||
    input.schedules.some(
      (schedule) =>
        schedule.dayOfWeek < 0 ||
        schedule.dayOfWeek > 6 ||
        !EXACT_HOUR_PATTERN.test(schedule.startTime) ||
        !EXACT_HOUR_PATTERN.test(schedule.endTime),
    )
  ) {
    throw new AdminSettingsError(
      "برنامه هر هفت روز هفته را با ساعت‌های دقیق وارد کنید.",
    );
  }
  if (
    input.schedules.some(
      (schedule) =>
        schedule.isWorkingDay && schedule.endTime <= schedule.startTime,
    )
  ) {
    throw new AdminSettingsError(
      "ساعت پایان هر روز کاری باید بعد از ساعت شروع باشد.",
    );
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const office = await tx.office.findUnique({
      where: { id: input.officeId },
      select: { deletedAt: true, id: true },
    });
    if (!office || office.deletedAt) {
      throw new AdminSettingsError("دفتر پیدا نشد.");
    }

    const currentSchedules = await tx.officeWeeklySchedule.findMany({
      where: { officeId: input.officeId },
    });
    const currentByDay = new Map(
      currentSchedules.map((schedule) => [schedule.dayOfWeek, schedule]),
    );
    const updatedSchedules = [];

    for (const schedule of input.schedules) {
      const current = currentByDay.get(schedule.dayOfWeek);
      const updated = await tx.officeWeeklySchedule.upsert({
        where: {
          officeId_dayOfWeek: {
            officeId: input.officeId,
            dayOfWeek: schedule.dayOfWeek,
          },
        },
        update: {
          endTime: schedule.endTime,
          isWorkingDay: schedule.isWorkingDay,
          startTime: schedule.startTime,
        },
        create: {
          ...schedule,
          officeId: input.officeId,
        },
      });
      updatedSchedules.push(updated);

      const changed =
        !current ||
        current.endTime !== updated.endTime ||
        current.isWorkingDay !== updated.isWorkingDay ||
        current.startTime !== updated.startTime;
      if (!changed) continue;

      await tx.auditLog.create({
        data: {
          action: "OFFICE_SCHEDULE_UPDATED",
          actorUserId: input.adminId,
          entityId: updated.id,
          entityType: "OfficeWeeklySchedule",
          oldValue: current
            ? {
                dayOfWeek: current.dayOfWeek,
                endTime: current.endTime,
                isWorkingDay: current.isWorkingDay,
                officeId: current.officeId,
                startTime: current.startTime,
              }
            : undefined,
          newValue: {
            dayOfWeek: updated.dayOfWeek,
            endTime: updated.endTime,
            isWorkingDay: updated.isWorkingDay,
            officeId: updated.officeId,
            startTime: updated.startTime,
          },
        },
      });
    }

    return updatedSchedules;
  });
}

export async function upsertOfficeScheduleException(input: {
  adminId: string;
  date: Date;
  endTime?: string;
  isWorkingDay: boolean;
  officeId: string;
  reason?: string;
  startTime?: string;
}) {
  if (input.isWorkingDay && (!input.startTime || !input.endTime || input.endTime <= input.startTime)) {
    throw new AdminSettingsError("برای روز کاری، ساعت شروع و پایان معتبر وارد کنید.");
  }
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const date = startOfLocalDay(input.date);
    const existing = await tx.officeScheduleException.findUnique({ where: { officeId_date: { officeId: input.officeId, date } } });
    const updated = await tx.officeScheduleException.upsert({
      where: { officeId_date: { officeId: input.officeId, date } },
      update: { endTime: input.isWorkingDay ? input.endTime : null, isWorkingDay: input.isWorkingDay, reason: input.reason?.trim() || null, startTime: input.isWorkingDay ? input.startTime : null },
      create: { date, endTime: input.isWorkingDay ? input.endTime : null, isWorkingDay: input.isWorkingDay, officeId: input.officeId, reason: input.reason?.trim() || null, startTime: input.isWorkingDay ? input.startTime : null },
    });
    await tx.auditLog.create({ data: {
      action: existing ? "OFFICE_EXCEPTION_UPDATED" : "OFFICE_EXCEPTION_CREATED", actorUserId: input.adminId, entityId: updated.id, entityType: "OfficeScheduleException",
      newValue: { date: updated.date.toISOString(), endTime: updated.endTime, isWorkingDay: updated.isWorkingDay, officeId: updated.officeId, reason: updated.reason, startTime: updated.startTime },
    } });
    return updated;
  });
}

export async function deleteOfficeScheduleException(input: { adminId: string; exceptionId: string }) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const exception = await tx.officeScheduleException.findUnique({ where: { id: input.exceptionId } });
    if (!exception) throw new AdminSettingsError("استثنا پیدا نشد.");
    await tx.officeScheduleException.delete({ where: { id: exception.id } });
    await tx.auditLog.create({ data: { action: "OFFICE_EXCEPTION_DELETED", actorUserId: input.adminId, entityId: exception.id, entityType: "OfficeScheduleException", oldValue: { date: exception.date.toISOString(), officeId: exception.officeId } } });
  });
}
