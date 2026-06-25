import { ReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";
import {
  calculateAutoAcceptAt,
  getReservationPolicy,
} from "@/lib/reservation-service/helpers";

import {
  assertApprovalPolicies,
} from "./approval-policies";
import {
  assertManagerOrAdmin,
  ReservationTransitionError,
  type DbClient,
} from "./shared";

async function finalizeApprovedReservation(
  tx: DbClient,
  input: {
    actorUserId: string | null;
    approvedAt: Date;
    approvedById: string | null;
    auditAction: string;
    notificationBody: string;
    notificationTitle: string;
    notificationType: string;
    reservationId: string;
  },
) {
  const approvedReservation = await tx.reservation.update({
    where: { id: input.reservationId },
    data: {
      approvedAt: input.approvedAt,
      approvedById: input.approvedById,
      autoAcceptAt: null,
      rejectionReason: null,
      status: ReservationStatus.APPROVED,
    },
  });

  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      entityType: "Reservation",
      entityId: input.reservationId,
      action: input.auditAction,
      newValue: {
        approvedAt: approvedReservation.approvedAt?.toISOString() ?? null,
        approvedById: approvedReservation.approvedById,
        status: approvedReservation.status,
      },
    },
  });

  await tx.notification.create({
    data: {
      body: input.notificationBody,
      reservationId: input.reservationId,
      title: input.notificationTitle,
      type: input.notificationType,
      userId: approvedReservation.userId,
    },
  });

  return approvedReservation;
}

export async function approveReservationInTransaction(
  tx: DbClient,
  input: {
    actorUserId: string | null;
    approvedAt: Date;
    approvedById: string | null;
    auditAction: string;
    notificationBody: string;
    notificationTitle: string;
    notificationType: string;
    reservationId: string;
  },
) {
  const reservation = await tx.reservation.findUnique({
    where: { id: input.reservationId },
    select: {
      endAt: true,
      id: true,
      resourcePoolId: true,
      startAt: true,
      status: true,
      userId: true,
    },
  });

  if (!reservation) {
    throw new ReservationTransitionError("Reservation was not found.");
  }

  if (
    reservation.status !== ReservationStatus.PENDING &&
    reservation.status !== ReservationStatus.ALTERNATIVE_PROPOSED
  ) {
    throw new ReservationTransitionError(
      "Only pending or alternative-proposed reservations can be approved.",
    );
  }

  await assertApprovalPolicies(
    {
      resourcePoolId: reservation.resourcePoolId,
      startAt: reservation.startAt,
      endAt: reservation.endAt,
      excludeReservationId: reservation.id,
      userId: reservation.userId,
    },
    tx,
  );

  return finalizeApprovedReservation(tx, {
    actorUserId: input.actorUserId,
    approvedAt: input.approvedAt,
    approvedById: input.approvedById,
    auditAction: input.auditAction,
    notificationBody: input.notificationBody,
    notificationTitle: input.notificationTitle,
    notificationType: input.notificationType,
    reservationId: reservation.id,
  });
}

export async function approveReservation(input: {
  reservationId: string;
  managerId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertManagerOrAdmin(input.managerId, tx);
    return approveReservationInTransaction(tx, {
      actorUserId: input.managerId,
      approvedAt: new Date(),
      approvedById: input.managerId,
      auditAction: "RESERVATION_APPROVED",
      notificationBody: "Your reservation request has been approved.",
      notificationTitle: "Reservation approved",
      notificationType: "RESERVATION_APPROVED",
      reservationId: input.reservationId,
    });
  });
}
