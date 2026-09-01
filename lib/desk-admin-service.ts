import "server-only";

import { ReservationStatus } from "@prisma/client";

import { AdminSettingsError, assertAdmin } from "@/lib/admin-settings-service/shared";
import { db } from "@/lib/db";
import { startOfLocalDay } from "@/lib/desk-schedule";

export { createBuilding, deleteBuilding, updateBuilding } from "@/lib/building-service";

const EXACT_HOUR_PATTERN = /^([01]\d|2[0-3]):00$/;

export async function createDesk(input: { adminId: string; name: string; buildingId: string; sortOrder: number }) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const building = await tx.building.findUnique({ where: { id: input.buildingId }, select: { deletedAt: true, id: true } });
    if (!building || building.deletedAt) throw new AdminSettingsError("دفتر پیدا نشد.");
    const desk = await tx.desk.create({ data: { active: true, name: input.name.trim(), buildingId: input.buildingId, sortOrder: input.sortOrder } });
    await tx.auditLog.create({
      data: { action: "DESK_CREATED", actorUserId: input.adminId, entityId: desk.id, entityType: "Desk", newValue: { active: desk.active, name: desk.name, buildingId: desk.buildingId, sortOrder: desk.sortOrder } },
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

type BuildingDeskInput = {
  active: boolean;
  deskId: string;
  name: string;
  sortOrder: number;
};

export async function updateBuildingDesks(input: {
  adminId: string;
  desks: BuildingDeskInput[];
  buildingId: string;
}) {
  const deskIds = new Set(input.desks.map((desk) => desk.deskId));
  const deskNames = new Set(input.desks.map((desk) => desk.name.trim()));
  if (
    deskIds.size !== input.desks.length ||
    deskNames.size !== input.desks.length ||
    input.desks.some(
      (desk) =>
        !desk.name.trim() ||
        desk.name.trim().length > 100 ||
        !Number.isInteger(desk.sortOrder) ||
        desk.sortOrder < 0 ||
        desk.sortOrder > 1000,
    )
  ) {
    throw new AdminSettingsError("فهرست میزها معتبر نیست.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const building = await tx.building.findUnique({
      where: { id: input.buildingId },
      select: { deletedAt: true, id: true },
    });
    if (!building || building.deletedAt) {
      throw new AdminSettingsError("دفتر پیدا نشد.");
    }

    const currentDesks = await tx.desk.findMany({
      where: { buildingId: input.buildingId },
    });
    if (
      currentDesks.length !== input.desks.length ||
      currentDesks.some((desk) => !deskIds.has(desk.id))
    ) {
      throw new AdminSettingsError(
        "فهرست میزها تغییر کرده است؛ صفحه را تازه کنید.",
      );
    }

    const currentById = new Map(currentDesks.map((desk) => [desk.id, desk]));
    const desksBeingDisabled = input.desks
      .filter((desk) => currentById.get(desk.deskId)?.active && !desk.active)
      .map((desk) => desk.deskId);
    if (desksBeingDisabled.length > 0) {
      const futureReservation = await tx.deskReservation.findFirst({
        where: {
          deskId: { in: desksBeingDisabled },
          endAt: { gt: new Date() },
          status: ReservationStatus.APPROVED,
        },
        select: { id: true },
      });
      if (futureReservation) {
        throw new AdminSettingsError(
          "ابتدا رزروهای فعال میزهای غیرفعال‌شده را لغو یا منتقل کنید.",
        );
      }
    }

    const updatedDesks = [];
    for (const desk of input.desks) {
      const current = currentById.get(desk.deskId)!;
      const updated = await tx.desk.update({
        where: { id: desk.deskId },
        data: {
          active: desk.active,
          name: desk.name.trim(),
          sortOrder: desk.sortOrder,
        },
      });
      updatedDesks.push(updated);

      const changed =
        current.active !== updated.active ||
        current.name !== updated.name ||
        current.sortOrder !== updated.sortOrder;
      if (!changed) continue;

      await tx.auditLog.create({
        data: {
          action: "DESK_UPDATED",
          actorUserId: input.adminId,
          entityId: updated.id,
          entityType: "Desk",
          oldValue: {
            active: current.active,
            name: current.name,
            sortOrder: current.sortOrder,
          },
          newValue: {
            active: updated.active,
            name: updated.name,
            sortOrder: updated.sortOrder,
          },
        },
      });
    }

    return updatedDesks;
  }).catch((error: unknown) => {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      throw new AdminSettingsError(
        "نام میزها در هر دفتر باید یکتا باشد.",
      );
    }
    throw error;
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
    input.autoApprovalDelayHours < 0 ||
    input.autoApprovalDelayHours > 24
  ) {
    throw new AdminSettingsError("مهلت تأیید خودکار باید بین ۰ تا ۲۴ ساعت باشد.");
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

type BuildingWeeklyScheduleInput = {
  dayOfWeek: number;
  endTime: string;
  isWorkingDay: boolean;
  startTime: string;
};

export async function updateBuildingWeeklySchedule(input: {
  adminId: string;
  buildingId: string;
  schedules: BuildingWeeklyScheduleInput[];
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
    const building = await tx.building.findUnique({
      where: { id: input.buildingId },
      select: { deletedAt: true, id: true },
    });
    if (!building || building.deletedAt) {
      throw new AdminSettingsError("دفتر پیدا نشد.");
    }

    const currentSchedules = await tx.buildingWeeklySchedule.findMany({
      where: { buildingId: input.buildingId },
    });
    const currentByDay = new Map(
      currentSchedules.map((schedule) => [schedule.dayOfWeek, schedule]),
    );
    const updatedSchedules = [];

    for (const schedule of input.schedules) {
      const current = currentByDay.get(schedule.dayOfWeek);
      const updated = await tx.buildingWeeklySchedule.upsert({
        where: {
          buildingId_dayOfWeek: {
            buildingId: input.buildingId,
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
          buildingId: input.buildingId,
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
          action: "BUILDING_SCHEDULE_UPDATED",
          actorUserId: input.adminId,
          entityId: updated.id,
          entityType: "BuildingWeeklySchedule",
          oldValue: current
            ? {
                dayOfWeek: current.dayOfWeek,
                endTime: current.endTime,
                isWorkingDay: current.isWorkingDay,
                buildingId: current.buildingId,
                startTime: current.startTime,
              }
            : undefined,
          newValue: {
            dayOfWeek: updated.dayOfWeek,
            endTime: updated.endTime,
            isWorkingDay: updated.isWorkingDay,
            buildingId: updated.buildingId,
            startTime: updated.startTime,
          },
        },
      });
    }

    return updatedSchedules;
  });
}

export async function upsertBuildingScheduleException(input: {
  adminId: string;
  date: Date;
  endTime?: string;
  isWorkingDay: boolean;
  buildingId: string;
  reason?: string;
  startTime?: string;
}) {
  if (input.isWorkingDay && (!input.startTime || !input.endTime || input.endTime <= input.startTime)) {
    throw new AdminSettingsError("برای روز کاری، ساعت شروع و پایان معتبر وارد کنید.");
  }
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const date = startOfLocalDay(input.date);
    const existing = await tx.buildingScheduleException.findUnique({ where: { buildingId_date: { buildingId: input.buildingId, date } } });
    const updated = await tx.buildingScheduleException.upsert({
      where: { buildingId_date: { buildingId: input.buildingId, date } },
      update: { endTime: input.isWorkingDay ? input.endTime : null, isWorkingDay: input.isWorkingDay, reason: input.reason?.trim() || null, startTime: input.isWorkingDay ? input.startTime : null },
      create: { date, endTime: input.isWorkingDay ? input.endTime : null, isWorkingDay: input.isWorkingDay, buildingId: input.buildingId, reason: input.reason?.trim() || null, startTime: input.isWorkingDay ? input.startTime : null },
    });
    await tx.auditLog.create({ data: {
      action: existing ? "BUILDING_EXCEPTION_UPDATED" : "BUILDING_EXCEPTION_CREATED", actorUserId: input.adminId, entityId: updated.id, entityType: "BuildingScheduleException",
      newValue: { date: updated.date.toISOString(), endTime: updated.endTime, isWorkingDay: updated.isWorkingDay, buildingId: updated.buildingId, reason: updated.reason, startTime: updated.startTime },
    } });
    return updated;
  });
}

export async function deleteBuildingScheduleException(input: { adminId: string; exceptionId: string }) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const exception = await tx.buildingScheduleException.findUnique({ where: { id: input.exceptionId } });
    if (!exception) throw new AdminSettingsError("استثنا پیدا نشد.");
    await tx.buildingScheduleException.delete({ where: { id: exception.id } });
    await tx.auditLog.create({ data: { action: "BUILDING_EXCEPTION_DELETED", actorUserId: input.adminId, entityId: exception.id, entityType: "BuildingScheduleException", oldValue: { date: exception.date.toISOString(), buildingId: exception.buildingId } } });
  });
}
