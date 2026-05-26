import "server-only";

import {
  AlternativeStatus,
  ReservationStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";

import { assertCapacityAvailableForApproval } from "@/lib/capacity-service";
import { db } from "@/lib/db";
import { validateReservationTimeRange } from "@/lib/schedule";

type DbClient = typeof db | Prisma.TransactionClient;
const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_DAILY_USER_HOUR_LIMIT = 3;
const DEFAULT_ONE_RESERVATION_PER_DAY_ENABLED = true;
const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR", {
  useGrouping: false,
});
const ACTIVE_REQUEST_STATUSES = [
  ReservationStatus.PENDING,
  ReservationStatus.APPROVED,
  ReservationStatus.ALTERNATIVE_PROPOSED,
];

export class ReservationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationTransitionError";
  }
}

async function assertManagerOrAdmin(userId: string, client: DbClient = db) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true },
  });

  if (
    !user?.active ||
    (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN)
  ) {
    throw new ReservationTransitionError(
      "Only managers or admins can perform this action.",
    );
  }
}

function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

function endOfLocalDay(date: Date): Date {
  const dayStart = startOfLocalDay(date);

  return new Date(dayStart.getTime() + 24 * ONE_HOUR_MS);
}

function reservationHours(startAt: Date, endAt: Date): number {
  return (endAt.getTime() - startAt.getTime()) / ONE_HOUR_MS;
}

async function getReservationPolicy(client: DbClient): Promise<{
  dailyUserHourLimit: number;
  oneReservationPerDayEnabled: boolean;
}> {
  const policy = await client.reservationPolicy.findUnique({
    where: { id: "default" },
    select: {
      dailyUserHourLimit: true,
      oneReservationPerDayEnabled: true,
    },
  });

  return {
    dailyUserHourLimit:
      policy?.dailyUserHourLimit ?? DEFAULT_DAILY_USER_HOUR_LIMIT,
    oneReservationPerDayEnabled:
      policy?.oneReservationPerDayEnabled ??
      DEFAULT_ONE_RESERVATION_PER_DAY_ENABLED,
  };
}

async function assertDailyUserReservationPolicy(input: {
  userId: string;
  startAt: Date;
  endAt: Date;
  statuses: ReservationStatus[];
  excludeReservationId?: string;
}, client: DbClient): Promise<void> {
  const policy = await getReservationPolicy(client);
  const dayStart = startOfLocalDay(input.startAt);
  const dayEnd = endOfLocalDay(input.startAt);
  const reservations = await client.reservation.findMany({
    where: {
      userId: input.userId,
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
      status: { in: input.statuses },
      id: input.excludeReservationId
        ? { not: input.excludeReservationId }
        : undefined,
    },
    select: {
      startAt: true,
      endAt: true,
    },
  });

  if (policy.oneReservationPerDayEnabled && reservations.length > 0) {
    throw new ReservationTransitionError(
      "Users can have only one reservation per day.",
    );
  }

  const existingHours = reservations.reduce(
    (total, reservation) =>
      total + reservationHours(reservation.startAt, reservation.endAt),
    0,
  );
  const requestedHours = reservationHours(input.startAt, input.endAt);

  if (existingHours + requestedHours > policy.dailyUserHourLimit) {
    throw new ReservationTransitionError(
      `هر کاربر حداکثر می‌تواند ${PERSIAN_NUMBER_FORMATTER.format(
        policy.dailyUserHourLimit,
      )} ساعت در یک روز رزرو کند.`,
    );
  }
}

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
    await assertDailyUserReservationPolicy(
      {
        userId: input.userId,
        startAt: input.startAt,
        endAt: input.endAt,
        statuses: ACTIVE_REQUEST_STATUSES,
      },
      tx,
    );

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

export async function approveReservation(input: {
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
        resourcePoolId: true,
        startAt: true,
        endAt: true,
        status: true,
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

    await assertCapacityAvailableForApproval(
      {
        resourcePoolId: reservation.resourcePoolId,
        startAt: reservation.startAt,
        endAt: reservation.endAt,
        excludeReservationId: reservation.id,
      },
      tx,
    );

    await assertDailyUserReservationPolicy(
      {
        userId: reservation.userId,
        startAt: reservation.startAt,
        endAt: reservation.endAt,
        statuses: [ReservationStatus.APPROVED],
        excludeReservationId: reservation.id,
      },
      tx,
    );

    const approvedReservation = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: ReservationStatus.APPROVED,
        approvedById: input.managerId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.managerId,
        entityType: "Reservation",
        entityId: reservation.id,
        action: "RESERVATION_APPROVED",
        oldValue: { status: reservation.status },
        newValue: {
          status: approvedReservation.status,
          approvedById: approvedReservation.approvedById,
          approvedAt: approvedReservation.approvedAt?.toISOString() ?? null,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: reservation.userId,
        reservationId: reservation.id,
        type: "RESERVATION_APPROVED",
        title: "Reservation approved",
        body: "Your reservation request has been approved.",
      },
    });

    return approvedReservation;
  });
}

export async function rejectReservation(input: {
  reservationId: string;
  managerId: string;
  rejectionReason?: string;
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

    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.ALTERNATIVE_PROPOSED
    ) {
      throw new ReservationTransitionError(
        "Only pending or alternative-proposed reservations can be rejected.",
      );
    }

    const rejectedReservation = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        status: ReservationStatus.REJECTED,
        rejectionReason: input.rejectionReason?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.managerId,
        entityType: "Reservation",
        entityId: reservation.id,
        action: "RESERVATION_REJECTED",
        oldValue: { status: reservation.status },
        newValue: {
          status: rejectedReservation.status,
          rejectionReason: rejectedReservation.rejectionReason,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: reservation.userId,
        reservationId: reservation.id,
        type: "RESERVATION_REJECTED",
        title: "Reservation rejected",
        body:
          rejectedReservation.rejectionReason ||
          "Your reservation request has been rejected.",
      },
    });

    return rejectedReservation;
  });
}

export async function proposeAlternative(input: {
  reservationId: string;
  managerId: string;
  proposedStartAt: Date;
  proposedEndAt: Date;
}) {
  await validateReservationTimeRange({
    startAt: input.proposedStartAt,
    endAt: input.proposedEndAt,
  });

  return db.$transaction(async (tx) => {
    await assertManagerOrAdmin(input.managerId, tx);

    const reservation = await tx.reservation.findUnique({
      where: { id: input.reservationId },
      select: {
        id: true,
        userId: true,
        resourcePoolId: true,
        startAt: true,
        endAt: true,
        status: true,
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
        "Only pending or alternative-proposed reservations can receive an alternative time.",
      );
    }

    await assertCapacityAvailableForApproval(
      {
        resourcePoolId: reservation.resourcePoolId,
        startAt: input.proposedStartAt,
        endAt: input.proposedEndAt,
        excludeReservationId: reservation.id,
      },
      tx,
    );

    await assertDailyUserReservationPolicy(
      {
        userId: reservation.userId,
        startAt: input.proposedStartAt,
        endAt: input.proposedEndAt,
        statuses: [ReservationStatus.APPROVED],
        excludeReservationId: reservation.id,
      },
      tx,
    );

    await tx.reservationAlternative.updateMany({
      where: {
        reservationId: reservation.id,
        status: AlternativeStatus.PROPOSED,
      },
      data: {
        status: AlternativeStatus.EXPIRED,
        respondedAt: new Date(),
      },
    });

    const updatedReservation = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
        startAt: input.proposedStartAt,
        endAt: input.proposedEndAt,
        status: ReservationStatus.PENDING,
        approvedById: null,
        approvedAt: null,
        rejectionReason: null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.managerId,
        entityType: "Reservation",
        entityId: reservation.id,
        action: "RESERVATION_TIME_UPDATED",
        oldValue: {
          status: reservation.status,
          startAt: reservation.startAt.toISOString(),
          endAt: reservation.endAt.toISOString(),
        },
        newValue: {
          status: updatedReservation.status,
          startAt: updatedReservation.startAt.toISOString(),
          endAt: updatedReservation.endAt.toISOString(),
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: reservation.userId,
        reservationId: reservation.id,
        type: "RESERVATION_TIME_UPDATED",
        title: "Reservation time updated",
        body: "A manager changed the time for your pending reservation.",
      },
    });

    return updatedReservation;
  });
}

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

    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ReservationTransitionError(
        "Only pending reservations can be cancelled by the requester.",
      );
    }

    const cancelledReservation = await tx.reservation.update({
      where: { id: reservation.id },
      data: {
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
          body: "A requester cancelled a pending reservation.",
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

    return cancelledReservation;
  });
}

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
