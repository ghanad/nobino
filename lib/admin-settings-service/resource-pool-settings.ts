import "server-only";

import { ReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";

import { findCapacityReductionBlocks } from "./capacity-reduction";
import { formatBlockingSlots } from "./formatting";
import { AdminSettingsError, assertAdmin } from "./shared";

export async function updateResourcePoolSettings(input: {
  adminId: string;
  buildingId: string;
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
      select: {
        id: true,
        name: true,
        capacity: true,
        active: true,
        buildingId: true,
        building: { select: { isTransitional: true, name: true } },
      },
    });

    if (!current) {
      throw new AdminSettingsError("Resource pool was not found.");
    }

    const destinationBuilding = await tx.building.findFirst({
      where: {
        id: input.buildingId,
        active: true,
        deletedAt: null,
        isTransitional: false,
      },
      select: { id: true, name: true },
    });

    if (!destinationBuilding) {
      throw new AdminSettingsError("برای مخزن ظرفیت یک ساختمان فعال و واقعی انتخاب کنید.");
    }

    const isMovingBetweenRealBuildings =
      current.buildingId !== destinationBuilding.id &&
      !current.building.isTransitional;

    if (isMovingBetweenRealBuildings) {
      const futureReservation = await tx.reservation.findFirst({
        where: {
          resourcePoolId: current.id,
          startAt: { gte: new Date() },
          status: {
            in: [
              ReservationStatus.PENDING,
              ReservationStatus.APPROVED,
              ReservationStatus.ALTERNATIVE_PROPOSED,
            ],
          },
        },
        select: { id: true },
      });

      if (futureReservation) {
        throw new AdminSettingsError(
          "این مخزن رزرو آینده دارد. برای تغییر ساختمان، ابتدا رزروهای آینده را لغو یا به زمان دیگری منتقل کنید.",
        );
      }
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
        buildingId: destinationBuilding.id,
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
        action:
          current.buildingId === updated.buildingId
            ? "CAPACITY_CHANGED"
            : "RESOURCE_POOL_BUILDING_ASSIGNED",
        oldValue: {
          active: current.active,
          buildingId: current.buildingId,
          buildingName: current.building.name,
          capacity: current.capacity,
          id: current.id,
          name: current.name,
        },
        newValue: {
          id: updated.id,
          buildingId: updated.buildingId,
          buildingName: destinationBuilding.name,
          name: updated.name,
          capacity: updated.capacity,
          active: updated.active,
        },
      },
    });

    return updated;
  });
}
