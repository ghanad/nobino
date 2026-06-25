import "server-only";

import { db } from "@/lib/db";

import { assertAdmin, LunchReservationError } from "./shared";

export async function createLunchLocation(input: {
  adminId: string;
  name: string;
}) {
  const name = input.name.trim();

  if (!name) {
    throw new LunchReservationError("نام ساختمان الزامی است.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const existing = await tx.lunchLocation.findUnique({
      where: { name },
      select: { id: true },
    });

    if (existing) {
      throw new LunchReservationError("ساختمانی با این نام قبلا ثبت شده است.");
    }

    const location = await tx.lunchLocation.create({
      data: { name, active: true },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchLocation",
        entityId: location.id,
        action: "LUNCH_LOCATION_CREATED",
        newValue: { name: location.name, active: location.active },
      },
    });

    return location;
  });
}

export async function updateLunchLocation(input: {
  adminId: string;
  locationId: string;
  name: string;
  active: boolean;
}) {
  const name = input.name.trim();

  if (!name) {
    throw new LunchReservationError("نام ساختمان الزامی است.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchLocation.findUnique({
      where: { id: input.locationId },
    });

    if (!current) {
      throw new LunchReservationError("ساختمان پیدا نشد.");
    }

    const duplicate = await tx.lunchLocation.findUnique({
      where: { name },
      select: { id: true },
    });

    if (duplicate && duplicate.id !== current.id) {
      throw new LunchReservationError("ساختمانی با این نام قبلا ثبت شده است.");
    }

    const updated = await tx.lunchLocation.update({
      where: { id: current.id },
      data: { name, active: input.active },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchLocation",
        entityId: updated.id,
        action: "LUNCH_LOCATION_UPDATED",
        oldValue: { name: current.name, active: current.active },
        newValue: { name: updated.name, active: updated.active },
      },
    });

    return updated;
  });
}

export async function deleteLunchLocation(input: {
  adminId: string;
  locationId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchLocation.findUnique({
      where: { id: input.locationId },
    });

    if (!current) {
      throw new LunchReservationError("ساختمان پیدا نشد.");
    }

    const usageCount = await tx.lunchReservation.count({
      where: { locationId: current.id },
    });

    if (usageCount > 0) {
      throw new LunchReservationError(
        "این ساختمان در گزارش‌های قبلی استفاده شده و باید به جای حذف، غیرفعال شود.",
      );
    }

    await tx.lunchLocation.delete({ where: { id: current.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchLocation",
        entityId: current.id,
        action: "LUNCH_LOCATION_DELETED",
        oldValue: { name: current.name, active: current.active },
      },
    });
  });
}
