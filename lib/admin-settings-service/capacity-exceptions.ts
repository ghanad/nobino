import "server-only";

import { db } from "@/lib/db";

import { findDailyCapacityReductionBlocks } from "./capacity-reduction";
import { formatBlockingSlots } from "./formatting";
import { startOfLocalDay } from "./date-time";
import { AdminSettingsError, assertAdmin } from "./shared";

export async function createCapacityException(input: {
  adminId: string;
  resourcePoolId: string;
  date: Date;
  capacity: number;
  reason?: string | null;
}) {
  if (input.capacity < 0 || input.capacity > 50) {
    throw new AdminSettingsError("Daily capacity must be between 0 and 50.");
  }

  const exceptionDate = startOfLocalDay(input.date);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const resourcePool = await tx.resourcePool.findUnique({
      where: { id: input.resourcePoolId },
      select: { id: true },
    });

    if (!resourcePool) {
      throw new AdminSettingsError("Resource pool was not found.");
    }

    const existing = await tx.resourcePoolCapacityException.findUnique({
      where: {
        resourcePoolId_date: {
          resourcePoolId: input.resourcePoolId,
          date: exceptionDate,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new AdminSettingsError(
        "A capacity exception already exists for this resource pool and date.",
      );
    }

    const blocks = await findDailyCapacityReductionBlocks({
      resourcePoolId: input.resourcePoolId,
      date: exceptionDate,
      capacity: input.capacity,
      client: tx,
    });

    if (blocks.length > 0) {
      throw new AdminSettingsError(
        `Daily capacity cannot be set to ${input.capacity}; approved reservations exceed it at ${formatBlockingSlots(
          blocks,
        )}. Cancel approved reservations first, then try again.`,
      );
    }

    const exception = await tx.resourcePoolCapacityException.create({
      data: {
        resourcePoolId: input.resourcePoolId,
        date: exceptionDate,
        capacity: input.capacity,
        reason: input.reason?.trim() || null,
        createdById: input.adminId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "ResourcePoolCapacityException",
        entityId: exception.id,
        action: "CAPACITY_EXCEPTION_CREATED",
        newValue: {
          resourcePoolId: exception.resourcePoolId,
          date: exception.date.toISOString(),
          capacity: exception.capacity,
          reason: exception.reason,
        },
      },
    });

    return exception;
  });
}

export async function updateCapacityException(input: {
  adminId: string;
  exceptionId: string;
  capacity: number;
  reason?: string | null;
}) {
  if (input.capacity < 0 || input.capacity > 50) {
    throw new AdminSettingsError("Daily capacity must be between 0 and 50.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.resourcePoolCapacityException.findUnique({
      where: { id: input.exceptionId },
    });

    if (!current) {
      throw new AdminSettingsError("Capacity exception was not found.");
    }

    const blocks = await findDailyCapacityReductionBlocks({
      resourcePoolId: current.resourcePoolId,
      date: current.date,
      capacity: input.capacity,
      client: tx,
    });

    if (blocks.length > 0) {
      throw new AdminSettingsError(
        `Daily capacity cannot be set to ${input.capacity}; approved reservations exceed it at ${formatBlockingSlots(
          blocks,
        )}. Cancel approved reservations first, then try again.`,
      );
    }

    const updated = await tx.resourcePoolCapacityException.update({
      where: { id: current.id },
      data: {
        capacity: input.capacity,
        reason: input.reason?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "ResourcePoolCapacityException",
        entityId: updated.id,
        action: "CAPACITY_EXCEPTION_UPDATED",
        oldValue: {
          resourcePoolId: current.resourcePoolId,
          date: current.date.toISOString(),
          capacity: current.capacity,
          reason: current.reason,
        },
        newValue: {
          resourcePoolId: updated.resourcePoolId,
          date: updated.date.toISOString(),
          capacity: updated.capacity,
          reason: updated.reason,
        },
      },
    });

    return updated;
  });
}

export async function deleteCapacityException(input: {
  adminId: string;
  exceptionId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.resourcePoolCapacityException.findUnique({
      where: { id: input.exceptionId },
    });

    if (!current) {
      throw new AdminSettingsError("Capacity exception was not found.");
    }

    await tx.resourcePoolCapacityException.delete({
      where: { id: current.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "ResourcePoolCapacityException",
        entityId: current.id,
        action: "CAPACITY_EXCEPTION_DELETED",
        oldValue: {
          resourcePoolId: current.resourcePoolId,
          date: current.date.toISOString(),
          capacity: current.capacity,
          reason: current.reason,
        },
      },
    });
  });
}
