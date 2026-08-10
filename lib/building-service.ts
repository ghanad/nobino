import "server-only";

import { ReservationStatus, type Prisma } from "@prisma/client";

import { AdminSettingsError, assertAdmin } from "@/lib/admin-settings-service/shared";
import { db } from "@/lib/db";

const DEFAULT_DAYS = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  endTime: "17:00",
  isWorkingDay: dayOfWeek !== 5,
  startTime: "09:00",
}));

type DbClient = typeof db | Prisma.TransactionClient;

async function getMutableBuilding(buildingId: string, client: DbClient) {
  const building = await client.building.findUnique({ where: { id: buildingId } });
  if (!building || building.deletedAt) {
    throw new AdminSettingsError("ساختمان پیدا نشد.");
  }
  if (building.isTransitional) {
    throw new AdminSettingsError("ساختمان انتقالی تا تعیین تکلیف در فاز مدیریت قابل تغییر نیست.");
  }
  return building;
}

async function assertNoActiveResourcePools(buildingId: string, client: DbClient) {
  const activePoolCount = await client.resourcePool.count({
    where: { buildingId, active: true },
  });
  if (activePoolCount > 0) {
    throw new AdminSettingsError("ابتدا مخزن‌های ظرفیت فعال این ساختمان را غیرفعال یا منتقل کنید.");
  }
}

export async function createBuilding(input: {
  adminId: string;
  name: string;
  sortOrder: number;
}) {
  const name = input.name.trim();
  if (!name) throw new AdminSettingsError("نام ساختمان الزامی است.");

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const building = await tx.building.create({
      data: { active: true, name, sortOrder: input.sortOrder, weeklySchedules: { create: DEFAULT_DAYS } },
    });
    await tx.auditLog.create({
      data: {
        action: "BUILDING_CREATED", actorUserId: input.adminId, entityId: building.id, entityType: "Building",
        newValue: { active: building.active, name: building.name, sortOrder: building.sortOrder },
      },
    });
    return building;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new AdminSettingsError("ساختمانی با این نام قبلاً ثبت شده است.");
    }
    throw error;
  });
}

export async function updateBuilding(input: {
  active: boolean;
  adminId: string;
  buildingId: string;
  name: string;
  sortOrder: number;
}) {
  const name = input.name.trim();
  if (!name) throw new AdminSettingsError("نام ساختمان الزامی است.");

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const current = await getMutableBuilding(input.buildingId, tx);
    if (!input.active && current.active) {
      await assertNoActiveResourcePools(current.id, tx);
      const futureDeskReservation = await tx.deskReservation.findFirst({
        where: { desk: { buildingId: current.id }, endAt: { gt: new Date() }, status: ReservationStatus.APPROVED },
        select: { id: true },
      });
      if (futureDeskReservation) {
        throw new AdminSettingsError("ابتدا رزروهای فعال میزهای این ساختمان را لغو یا منتقل کنید.");
      }
    }
    const building = await tx.building.update({
      where: { id: current.id }, data: { active: input.active, name, sortOrder: input.sortOrder },
    });
    await tx.auditLog.create({
      data: {
        action: "BUILDING_UPDATED", actorUserId: input.adminId, entityId: building.id, entityType: "Building",
        oldValue: { active: current.active, name: current.name, sortOrder: current.sortOrder },
        newValue: { active: building.active, name: building.name, sortOrder: building.sortOrder },
      },
    });
    return building;
  });
}

export async function deleteBuilding(input: { adminId: string; buildingId: string }) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const current = await getMutableBuilding(input.buildingId, tx);
    const resourcePoolCount = await tx.resourcePool.count({ where: { buildingId: current.id } });
    if (resourcePoolCount > 0) {
      throw new AdminSettingsError("ساختمان دارای مخزن ظرفیت است؛ ابتدا مخزن را صریحاً منتقل کنید.");
    }

    const deletedAt = new Date();
    const deletedFutureReservations = await tx.deskReservation.deleteMany({
      where: { desk: { buildingId: current.id }, startAt: { gte: deletedAt } },
    });
    const building = await tx.building.update({
      where: { id: current.id }, data: { active: false, deletedAt },
    });
    await tx.auditLog.create({
      data: {
        action: "BUILDING_DELETED", actorUserId: input.adminId, entityId: building.id, entityType: "Building",
        oldValue: { active: current.active, name: current.name },
        newValue: { deletedAt: deletedAt.toISOString(), deletedFutureReservations: deletedFutureReservations.count, name: building.name },
      },
    });
    return { deletedFutureReservations: deletedFutureReservations.count };
  });
}
