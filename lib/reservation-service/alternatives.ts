import "server-only";

import { AlternativeStatus, ReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";

import {
  assertDailyUserReservationPolicy,
} from "./approval-policies";
import {
  assertCapacityAvailableForApproval,
} from "@/lib/capacity-service";
import {
  ReservationTransitionError,
} from "./shared";

export async function acceptAlternative(input: {
  alternativeId: string;
  userId: string;
}) {
  return db.$transaction(async (tx) => {
    const alternative = await tx.reservationAlternative.findUnique({
      where: { id: input.alternativeId },
      select: {
        id: true,
        reservationId: true,
        proposedStartAt: true,
        proposedEndAt: true,
        proposedById: true,
        status: true,
        reservation: {
          select: {
            id: true,
            userId: true,
            resourcePoolId: true,
            startAt: true,
            endAt: true,
            status: true,
          },
        },
      },
    });

    if (!alternative) {
      throw new ReservationTransitionError("Alternative proposal was not found.");
    }

    if (alternative.reservation.userId !== input.userId) {
      throw new ReservationTransitionError(
        "You can only respond to your own alternative proposals.",
      );
    }

    if (
      alternative.status !== AlternativeStatus.PROPOSED ||
      alternative.reservation.status !== ReservationStatus.ALTERNATIVE_PROPOSED
    ) {
      throw new ReservationTransitionError(
        "Only active alternative proposals can be accepted.",
      );
    }

    await assertCapacityAvailableForApproval(
      {
        resourcePoolId: alternative.reservation.resourcePoolId,
        startAt: alternative.proposedStartAt,
        endAt: alternative.proposedEndAt,
        excludeReservationId: alternative.reservation.id,
      },
      tx,
    );

    await assertDailyUserReservationPolicy(
      {
        userId: alternative.reservation.userId,
        startAt: alternative.proposedStartAt,
        endAt: alternative.proposedEndAt,
        statuses: [ReservationStatus.APPROVED],
        excludeReservationId: alternative.reservation.id,
      },
      tx,
    );

    const now = new Date();

    await tx.reservationAlternative.update({
      where: { id: alternative.id },
      data: {
        status: AlternativeStatus.ACCEPTED,
        respondedAt: now,
      },
    });

    const approvedReservation = await tx.reservation.update({
      where: { id: alternative.reservation.id },
      data: {
        autoAcceptAt: null,
        startAt: alternative.proposedStartAt,
        endAt: alternative.proposedEndAt,
        status: ReservationStatus.APPROVED,
        approvedById: alternative.proposedById,
        approvedAt: now,
        rejectionReason: null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "Reservation",
        entityId: alternative.reservation.id,
        action: "ALTERNATIVE_ACCEPTED",
        oldValue: {
          status: alternative.reservation.status,
          startAt: alternative.reservation.startAt.toISOString(),
          endAt: alternative.reservation.endAt.toISOString(),
        },
        newValue: {
          status: approvedReservation.status,
          startAt: approvedReservation.startAt.toISOString(),
          endAt: approvedReservation.endAt.toISOString(),
          alternativeId: alternative.id,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: alternative.proposedById,
        reservationId: alternative.reservation.id,
        type: "ALTERNATIVE_ACCEPTED",
        title: "Alternative accepted",
        body: "A requester accepted your proposed alternative time.",
      },
    });

    return approvedReservation;
  });
}

export async function rejectAlternative(input: {
  alternativeId: string;
  userId: string;
}) {
  return db.$transaction(async (tx) => {
    const alternative = await tx.reservationAlternative.findUnique({
      where: { id: input.alternativeId },
      select: {
        id: true,
        reservationId: true,
        proposedStartAt: true,
        proposedEndAt: true,
        proposedById: true,
        status: true,
        reservation: {
          select: {
            id: true,
            userId: true,
            status: true,
          },
        },
      },
    });

    if (!alternative) {
      throw new ReservationTransitionError("Alternative proposal was not found.");
    }

    if (alternative.reservation.userId !== input.userId) {
      throw new ReservationTransitionError(
        "You can only respond to your own alternative proposals.",
      );
    }

    if (
      alternative.status !== AlternativeStatus.PROPOSED ||
      alternative.reservation.status !== ReservationStatus.ALTERNATIVE_PROPOSED
    ) {
      throw new ReservationTransitionError(
        "Only active alternative proposals can be rejected.",
      );
    }

    const now = new Date();

    await tx.reservationAlternative.update({
      where: { id: alternative.id },
      data: {
        status: AlternativeStatus.REJECTED,
        respondedAt: now,
      },
    });

    const rejectedReservation = await tx.reservation.update({
      where: { id: alternative.reservation.id },
      data: {
        status: ReservationStatus.REJECTED,
        rejectionReason: "Alternative proposal rejected by requester.",
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "Reservation",
        entityId: alternative.reservation.id,
        action: "ALTERNATIVE_REJECTED",
        oldValue: { status: alternative.reservation.status },
        newValue: {
          status: rejectedReservation.status,
          rejectionReason: rejectedReservation.rejectionReason,
          alternativeId: alternative.id,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: alternative.proposedById,
        reservationId: alternative.reservation.id,
        type: "ALTERNATIVE_REJECTED",
        title: "Alternative rejected",
        body: "A requester rejected your proposed alternative time.",
      },
    });

    return rejectedReservation;
  });
}
