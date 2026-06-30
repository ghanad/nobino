import "server-only";

import { ReservationStatus, UserRole } from "@prisma/client";

import { db } from "@/lib/db";
import { assertMeetingRoomCapacityAvailableForApproval } from "@/lib/meeting-room-capacity-service";
import { validateMeetingRoomReservationTimeRange } from "@/lib/meeting-room-schedule";
import {
  assertManagerOrAdmin,
  ReservationTransitionError,
  type DbClient,
} from "@/lib/reservation-service/shared";

const ONE_HOUR_MS = 60 * 60 * 1000;

export function calculateMeetingRoomAutoApprovalAt(input: {
  autoApprovalDelayHours: number;
  autoApprovalEnabled: boolean;
  createdAt: Date;
  startAt: Date;
}): Date | null {
  if (!input.autoApprovalEnabled) {
    return null;
  }

  const deadline = new Date(
    input.createdAt.getTime() + input.autoApprovalDelayHours * ONE_HOUR_MS,
  );

  return deadline.getTime() < input.startAt.getTime()
    ? deadline
    : input.startAt;
}

async function notifyManagers(
  tx: DbClient,
  input: {
    reservationId: string;
    roomName: string;
  },
) {
  const managers = await tx.user.findMany({
    where: {
      active: true,
      role: { in: [UserRole.MANAGER, UserRole.ADMIN] },
    },
    select: { id: true },
  });

  if (managers.length === 0) {
    return;
  }

  await tx.notification.createMany({
    data: managers.map((manager) => ({
      userId: manager.id,
      meetingRoomReservationId: input.reservationId,
      type: "NEW_PENDING_MEETING_ROOM_RESERVATION",
      title: "درخواست اتاق جلسه",
      body: `درخواست رزرو ${input.roomName} در انتظار بررسی است.`,
    })),
  });
}

export async function approveMeetingRoomReservationInTransaction(
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
  const reservation = await tx.meetingRoomReservation.findUnique({
    where: { id: input.reservationId },
    select: {
      endAt: true,
      id: true,
      roomId: true,
      startAt: true,
      status: true,
      userId: true,
    },
  });

  if (!reservation) {
    throw new ReservationTransitionError(
      "Meeting room reservation was not found.",
    );
  }

  if (reservation.status !== ReservationStatus.PENDING) {
    throw new ReservationTransitionError(
      "Only pending meeting room reservations can be approved.",
    );
  }

  await validateMeetingRoomReservationTimeRange(
    {
      roomId: reservation.roomId,
      startAt: reservation.startAt,
      endAt: reservation.endAt,
    },
    tx,
  );
  await assertMeetingRoomCapacityAvailableForApproval(
    {
      roomId: reservation.roomId,
      startAt: reservation.startAt,
      endAt: reservation.endAt,
      excludeReservationId: reservation.id,
    },
    tx,
  );

  const approvedReservation = await tx.meetingRoomReservation.update({
    where: { id: reservation.id },
    data: {
      autoApprovalAt: null,
      approvedAt: input.approvedAt,
      approvedById: input.approvedById,
      rejectionReason: null,
      status: ReservationStatus.APPROVED,
    },
  });

  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      entityType: "MeetingRoomReservation",
      entityId: reservation.id,
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
      meetingRoomReservationId: reservation.id,
      title: input.notificationTitle,
      type: input.notificationType,
      userId: reservation.userId,
    },
  });

  return approvedReservation;
}

export async function createMeetingRoomReservationRequest(input: {
  userId: string;
  roomId: string;
  startAt: Date;
  endAt: Date;
  title?: string | null;
}) {
  const title = input.title?.trim() || null;

  if (title && title.length > 120) {
    throw new ReservationTransitionError(
      "Meeting title must be 120 characters or fewer.",
    );
  }

  await validateMeetingRoomReservationTimeRange({
    roomId: input.roomId,
    startAt: input.startAt,
    endAt: input.endAt,
  });

  return db.$transaction(async (tx) => {
    const room = await tx.meetingRoom.findUnique({
      where: { id: input.roomId },
      select: {
        autoApprovalDelayHours: true,
        autoApprovalEnabled: true,
        id: true,
        isActive: true,
        name: true,
      },
    });

    if (!room?.isActive) {
      throw new ReservationTransitionError("Meeting room is not available.");
    }

    const createdAt = new Date();
    const autoApprovalAt = calculateMeetingRoomAutoApprovalAt({
      autoApprovalDelayHours: room.autoApprovalDelayHours,
      autoApprovalEnabled: room.autoApprovalEnabled,
      createdAt,
      startAt: input.startAt,
    });

    const reservation = await tx.meetingRoomReservation.create({
      data: {
        autoApprovalAt,
        createdAt,
        endAt: input.endAt,
        roomId: input.roomId,
        startAt: input.startAt,
        status: ReservationStatus.PENDING,
        title,
        userId: input.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "MeetingRoomReservation",
        entityId: reservation.id,
        action: "MEETING_ROOM_RESERVATION_CREATED",
        newValue: {
          createdAt: reservation.createdAt.toISOString(),
          autoApprovalAt: reservation.autoApprovalAt?.toISOString() ?? null,
          endAt: reservation.endAt.toISOString(),
          roomId: reservation.roomId,
          startAt: reservation.startAt.toISOString(),
          status: reservation.status,
          title: reservation.title,
          userId: reservation.userId,
        },
      },
    });

    await notifyManagers(tx, {
      reservationId: reservation.id,
      roomName: room.name,
    });

    return reservation;
  });
}

export async function approveMeetingRoomReservation(input: {
  reservationId: string;
  managerId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertManagerOrAdmin(input.managerId, tx);

    return approveMeetingRoomReservationInTransaction(tx, {
      actorUserId: input.managerId,
      approvedAt: new Date(),
      approvedById: input.managerId,
      auditAction: "MEETING_ROOM_RESERVATION_APPROVED",
      notificationBody: "درخواست رزرو اتاق جلسه شما تایید شد.",
      notificationTitle: "رزرو اتاق جلسه تایید شد",
      notificationType: "MEETING_ROOM_RESERVATION_APPROVED",
      reservationId: input.reservationId,
    });
  });
}

export async function rejectMeetingRoomReservation(input: {
  reservationId: string;
  managerId: string;
  rejectionReason?: string | null;
}) {
  return db.$transaction(async (tx) => {
    await assertManagerOrAdmin(input.managerId, tx);

    const reservation = await tx.meetingRoomReservation.findUnique({
      where: { id: input.reservationId },
      select: { id: true, status: true, userId: true },
    });

    if (!reservation) {
      throw new ReservationTransitionError(
        "Meeting room reservation was not found.",
      );
    }

    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ReservationTransitionError(
        "Only pending meeting room reservations can be rejected.",
      );
    }

    const updated = await tx.meetingRoomReservation.update({
      where: { id: reservation.id },
      data: {
        autoApprovalAt: null,
        rejectionReason: input.rejectionReason?.trim() || null,
        status: ReservationStatus.REJECTED,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.managerId,
        entityType: "MeetingRoomReservation",
        entityId: updated.id,
        action: "MEETING_ROOM_RESERVATION_REJECTED",
        newValue: {
          rejectionReason: updated.rejectionReason,
          status: updated.status,
        },
      },
    });

    await tx.notification.create({
      data: {
        body: "درخواست رزرو اتاق جلسه شما رد شد.",
        meetingRoomReservationId: updated.id,
        title: "رزرو اتاق جلسه رد شد",
        type: "MEETING_ROOM_RESERVATION_REJECTED",
        userId: reservation.userId,
      },
    });

    return updated;
  });
}

export async function cancelMeetingRoomReservationByUser(input: {
  reservationId: string;
  userId: string;
}) {
  return db.$transaction(async (tx) => {
    const reservation = await tx.meetingRoomReservation.findUnique({
      where: { id: input.reservationId },
      select: { id: true, status: true, userId: true },
    });

    if (!reservation) {
      throw new ReservationTransitionError(
        "Meeting room reservation was not found.",
      );
    }

    if (reservation.userId !== input.userId) {
      throw new ReservationTransitionError(
        "Only the requester can cancel this meeting room reservation.",
      );
    }

    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.APPROVED
    ) {
      throw new ReservationTransitionError(
        "Only pending or approved meeting room reservations can be cancelled.",
      );
    }

    const updated = await tx.meetingRoomReservation.update({
      where: { id: reservation.id },
      data: {
        autoApprovalAt: null,
        cancelledAt: new Date(),
        cancelledById: input.userId,
        status: ReservationStatus.CANCELLED_BY_USER,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "MeetingRoomReservation",
        entityId: updated.id,
        action: "MEETING_ROOM_RESERVATION_CANCELLED_BY_USER",
        newValue: {
          cancelledAt: updated.cancelledAt?.toISOString() ?? null,
          cancelledById: updated.cancelledById,
          status: updated.status,
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
          body: "یک رزرو اتاق جلسه توسط درخواست‌دهنده لغو شد.",
          meetingRoomReservationId: updated.id,
          title: "لغو رزرو اتاق جلسه",
          type: "MEETING_ROOM_RESERVATION_CANCELLED_BY_USER",
          userId: manager.id,
        })),
      });
    }

    return updated;
  });
}

export async function cancelMeetingRoomReservationByManager(input: {
  reservationId: string;
  managerId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertManagerOrAdmin(input.managerId, tx);

    const reservation = await tx.meetingRoomReservation.findUnique({
      where: { id: input.reservationId },
      select: { id: true, status: true, userId: true },
    });

    if (!reservation) {
      throw new ReservationTransitionError(
        "Meeting room reservation was not found.",
      );
    }

    if (
      reservation.status !== ReservationStatus.PENDING &&
      reservation.status !== ReservationStatus.APPROVED
    ) {
      throw new ReservationTransitionError(
        "Only pending or approved meeting room reservations can be cancelled.",
      );
    }

    const updated = await tx.meetingRoomReservation.update({
      where: { id: reservation.id },
      data: {
        autoApprovalAt: null,
        cancelledAt: new Date(),
        cancelledById: input.managerId,
        status: ReservationStatus.CANCELLED_BY_ADMIN,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.managerId,
        entityType: "MeetingRoomReservation",
        entityId: updated.id,
        action: "MEETING_ROOM_RESERVATION_CANCELLED_BY_MANAGER",
        newValue: {
          cancelledAt: updated.cancelledAt?.toISOString() ?? null,
          cancelledById: updated.cancelledById,
          status: updated.status,
        },
      },
    });

    await tx.notification.create({
      data: {
        body: "رزرو اتاق جلسه شما لغو شد.",
        meetingRoomReservationId: updated.id,
        title: "لغو رزرو اتاق جلسه",
        type: "MEETING_ROOM_RESERVATION_CANCELLED_BY_MANAGER",
        userId: reservation.userId,
      },
    });

    return updated;
  });
}
