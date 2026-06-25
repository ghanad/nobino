import "server-only";

import { db } from "@/lib/db";

import { findCapacityReductionBlocks } from "./capacity-reduction";
import { formatBlockingSlots } from "./formatting";
import { AdminSettingsError, assertAdmin } from "./shared";

export async function updateResourcePoolSettings(input: {
  adminId: string;
  resourcePoolId: string;
  name: string;
  capacity: number;
  active: boolean;
}) {
  if (input.capacity < 1 || input.capacity > 50) {
    throw new AdminSettingsError("Capacity must be between 1 and 50.");
  }

  const name = input.name.trim();

  if (!name) {
    throw new AdminSettingsError("Resource pool name is required.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.resourcePool.findUnique({
      where: { id: input.resourcePoolId },
      select: { id: true, name: true, capacity: true, active: true },
    });

    if (!current) {
      throw new AdminSettingsError("Resource pool was not found.");
    }

    if (input.capacity < current.capacity) {
      const blocks = await findCapacityReductionBlocks({
        resourcePoolId: current.id,
        capacity: input.capacity,
        client: tx,
      });

      if (blocks.length > 0) {
        throw new AdminSettingsError(
          `Capacity cannot be reduced to ${input.capacity}; future approved reservations exceed it at ${formatBlockingSlots(
            blocks,
          )}.`,
        );
      }
    }

    const updated = await tx.resourcePool.update({
      where: { id: current.id },
      data: {
        name,
        capacity: input.capacity,
        active: input.active,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "ResourcePool",
        entityId: updated.id,
        action: "CAPACITY_CHANGED",
        oldValue: current,
        newValue: {
          id: updated.id,
          name: updated.name,
          capacity: updated.capacity,
          active: updated.active,
        },
      },
    });

    return updated;
  });
}
