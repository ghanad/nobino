import "server-only";

import { ReservationStatus, UserRole } from "@prisma/client";

import { assertCapacityAvailableForApproval } from "@/lib/capacity-service";
import { db } from "@/lib/db";
import { validateReservationTimeRange } from "@/lib/schedule";

export async function createReservationRequest(input: {
  userId: string;
  resourcePoolId: string;
  startAt: Date;
  endAt: Date;
  reason?: string;
}) {
  await validateReservationTimeRange({
    startAt: input.startAt,
    endAt: input.endAt,
  });

  // Product choice for phase 4: already-full approved capacity blocks new requests.
  // Pending requests remain non-blocking and do not count here.
  await assertCapacityAvailableForApproval({
    resourcePoolId: input.resourcePoolId,
    startAt: input.startAt,
    endAt: input.endAt,
  });

  return db.$transaction(async (tx) => {
    const reservation = await tx.reservation.create({
      data: {
        userId: input.userId,
        resourcePoolId: input.resourcePoolId,
        startAt: input.startAt,
        endAt: input.endAt,
        status: ReservationStatus.PENDING,
        reason: input.reason?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "Reservation",
        entityId: reservation.id,
        action: "RESERVATION_CREATED",
        newValue: {
          userId: reservation.userId,
          resourcePoolId: reservation.resourcePoolId,
          startAt: reservation.startAt.toISOString(),
          endAt: reservation.endAt.toISOString(),
          status: reservation.status,
          reason: reservation.reason,
        },
      },
    });

    const managers = await tx.user.findMany({
      where: {
        active: true,
        role: { in: [UserRole.MANAGER, UserRole.ADMIN] },
      },
      select: { id: true },
    });

    if (managers.length > 0) {
      await tx.notification.createMany({
        data: managers.map((manager) => ({
          userId: manager.id,
          reservationId: reservation.id,
          type: "NEW_PENDING_RESERVATION",
          title: "New pending reservation",
          body: "A reservation request is waiting for manager review.",
        })),
      });
    }

    return reservation;
  });
}
