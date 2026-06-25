import "server-only";

import { db } from "@/lib/db";

import { startOfLocalDay } from "./date-time";
import { assertAdmin, LunchReservationError } from "./shared";

export async function createLunchException(input: {
  adminId: string;
  date: Date;
  isServiceDay: boolean;
  reason?: string | null;
}) {
  const date = startOfLocalDay(input.date);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const existing = await tx.lunchException.findUnique({
      where: { date },
      select: { id: true },
    });

    if (existing) {
      throw new LunchReservationError("برای این تاریخ قبلا استثنای ناهار ثبت شده است.");
    }

    const exception = await tx.lunchException.create({
      data: {
        date,
        isServiceDay: input.isServiceDay,
        reason: input.reason?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchException",
        entityId: exception.id,
        action: "LUNCH_EXCEPTION_CREATED",
        newValue: {
          date: exception.date.toISOString(),
          isServiceDay: exception.isServiceDay,
          reason: exception.reason,
        },
      },
    });

    return exception;
  });
}

export async function updateLunchException(input: {
  adminId: string;
  exceptionId: string;
  isServiceDay: boolean;
  reason?: string | null;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchException.findUnique({
      where: { id: input.exceptionId },
    });

    if (!current) {
      throw new LunchReservationError("استثنای ناهار پیدا نشد.");
    }

    const updated = await tx.lunchException.update({
      where: { id: current.id },
      data: {
        isServiceDay: input.isServiceDay,
        reason: input.reason?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchException",
        entityId: updated.id,
        action: "LUNCH_EXCEPTION_UPDATED",
        oldValue: {
          date: current.date.toISOString(),
          isServiceDay: current.isServiceDay,
          reason: current.reason,
        },
        newValue: {
          date: updated.date.toISOString(),
          isServiceDay: updated.isServiceDay,
          reason: updated.reason,
        },
      },
    });

    return updated;
  });
}

export async function deleteLunchException(input: {
  adminId: string;
  exceptionId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchException.findUnique({
      where: { id: input.exceptionId },
    });

    if (!current) {
      throw new LunchReservationError("استثنای ناهار پیدا نشد.");
    }

    await tx.lunchException.delete({ where: { id: current.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchException",
        entityId: current.id,
        action: "LUNCH_EXCEPTION_DELETED",
        oldValue: {
          date: current.date.toISOString(),
          isServiceDay: current.isServiceDay,
          reason: current.reason,
        },
      },
    });
  });
}
