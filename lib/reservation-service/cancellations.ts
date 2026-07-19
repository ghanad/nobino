import "server-only";

import { ReservationStatus, UserRole } from "@prisma/client";

import { db } from "@/lib/db";
import { cancelLinkedFoodReservationInTransaction } from "@/lib/lunch-service";

import {
  assertManagerOrAdmin,
  ReservationTransitionError,
} from "./shared";

export async function cancelReservationByUser(input: {
  reservationId: string;
  userId: string;
}) {
  return db.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: input.reservationId },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });

    if (!reservation) {
      throw new ReservationTransitionError("Reservation was not found.");
    }

    if (reservation.userId !== input.userId) {
      throw new ReservationTransitionError(
        "You can only cancel your own reservations.",
      );
    }

    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.APPROVED
    ) {
      throw new ReservationTransitionError(
        "Only pending or approved reservations can be cancelled by the requester.",
      );
    }

    const cancelledReservation = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        autoAcceptAt: null,
        status: ReservationStatus.CANCELLED_BY_USER,
        cancelledById: input.userId,
        cancelledAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "Reservation",
        entityId: reservation.id,
        action: "RESERVATION_CANCELLED",
        oldValue: { status: reservation.status },
        newValue: {
          status: cancelledReservation.status,
          cancelledById: cancelledReservation.cancelledById,
          cancelledAt: cancelledReservation.cancelledAt?.toISOString() ?? null,
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
          type: "RESERVATION_CANCELLED",
          title: "Reservation cancelled",
          body:
            reservation.status === ReservationStatus.APPROVED
              ? "A requester cancelled an approved reservation."
              : "A requester cancelled a pending reservation.",
        })),
      });
    }

    return cancelledReservation;
  });
}

export async function cancelReservationByManager(input: {
  reservationId: string;
  managerId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertManagerOrAdmin(input.managerId, tx);

    const reservation = await tx.reservation.findUnique({
      where: { id: input.reservationId },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });

    if (!reservation) {
      throw new ReservationTransitionError("Reservation was not found.");
    }

    if (reservation.status !== ReservationStatus.APPROVED) {
      throw new ReservationTransitionError(
        "Only approved reservations can be cancelled by a manager.",
      );
    }

    const cancelledReservation = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        autoAcceptAt: null,
        status: ReservationStatus.CANCELLED_BY_ADMIN,
        cancelledById: input.managerId,
        cancelledAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.managerId,
        entityType: "Reservation",
        entityId: reservation.id,
        action: "RESERVATION_CANCELLED",
        oldValue: { status: reservation.status },
        newValue: {
          status: cancelledReservation.status,
          cancelledById: cancelledReservation.cancelledById,
          cancelledAt: cancelledReservation.cancelledAt?.toISOString() ?? null,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: reservation.userId,
        reservationId: reservation.id,
        type: "RESERVATION_CANCELLED",
        title: "Reservation cancelled",
        body: "A manager cancelled your approved reservation.",
      },
    });

    await cancelLinkedFoodReservationInTransaction({
      sourceReservationId: reservation.id,
      actorUserId: input.managerId,
      client: tx,
    });

    return cancelledReservation;
  });
}
