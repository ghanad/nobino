import "server-only";

import { db } from "@/lib/db";
import { AdminSettingsError, assertAdmin } from "@/lib/admin-settings-service/shared";
import { assertWorkingHours, startOfLocalDay } from "@/lib/admin-settings-service/date-time";

export async function createMeetingRoom(input: {
  adminId: string;
  name: string;
  description?: string | null;
  location?: string | null;
  isActive: boolean;
  sortOrder: number;
  autoApprovalEnabled: boolean;
  autoApprovalDelayHours: number;
}) {
  const name = input.name.trim();

  if (!name) {
    throw new AdminSettingsError("Meeting room name is required.");
  }

  if (!Number.isInteger(input.sortOrder)) {
    throw new AdminSettingsError("Sort order must be a whole number.");
  }

  if (
    !Number.isInteger(input.autoApprovalDelayHours) ||
    input.autoApprovalDelayHours < 1 ||
    input.autoApprovalDelayHours > 24
  ) {
    throw new AdminSettingsError(
      "Meeting room auto accept delay must be between 1 and 24 hours.",
    );
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const room = await tx.meetingRoom.create({
      data: {
        autoApprovalDelayHours: input.autoApprovalDelayHours,
        autoApprovalEnabled: input.autoApprovalEnabled,
        description: input.description?.trim() || null,
        isActive: input.isActive,
        location: input.location?.trim() || null,
        name,
        sortOrder: input.sortOrder,
        weeklySchedules: {
          create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            dayOfWeek,
            isWorkingDay: dayOfWeek !== 5,
            startTime: "09:00",
            endTime: "17:00",
          })),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "MeetingRoom",
        entityId: room.id,
        action: "MEETING_ROOM_CREATED",
        newValue: {
          autoApprovalEnabled: room.autoApprovalEnabled,
          autoApprovalDelayHours: room.autoApprovalDelayHours,
          description: room.description,
          isActive: room.isActive,
          location: room.location,
          name: room.name,
          sortOrder: room.sortOrder,
        },
      },
    });

    return room;
  });
}

export async function updateMeetingRoom(input: {
  adminId: string;
  roomId: string;
  name: string;
  description?: string | null;
  location?: string | null;
  isActive: boolean;
  sortOrder: number;
  autoApprovalEnabled: boolean;
  autoApprovalDelayHours: number;
}) {
  const name = input.name.trim();

  if (!name) {
    throw new AdminSettingsError("Meeting room name is required.");
  }

  if (
    !Number.isInteger(input.autoApprovalDelayHours) ||
    input.autoApprovalDelayHours < 1 ||
    input.autoApprovalDelayHours > 24
  ) {
    throw new AdminSettingsError(
      "Meeting room auto accept delay must be between 1 and 24 hours.",
    );
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.meetingRoom.findUnique({
      where: { id: input.roomId },
    });

    if (!current || current.deletedAt) {
      throw new AdminSettingsError("Meeting room was not found.");
    }

    const updated = await tx.meetingRoom.update({
      where: { id: current.id },
      data: {
        autoApprovalDelayHours: input.autoApprovalDelayHours,
        autoApprovalEnabled: input.autoApprovalEnabled,
        description: input.description?.trim() || null,
        isActive: input.isActive,
        location: input.location?.trim() || null,
        name,
        sortOrder: input.sortOrder,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "MeetingRoom",
        entityId: updated.id,
        action:
          current.isActive !== updated.isActive
            ? "MEETING_ROOM_ACTIVE_STATUS_CHANGED"
            : "MEETING_ROOM_UPDATED",
        oldValue: {
          autoApprovalEnabled: current.autoApprovalEnabled,
          autoApprovalDelayHours: current.autoApprovalDelayHours,
          description: current.description,
          isActive: current.isActive,
          location: current.location,
          name: current.name,
          sortOrder: current.sortOrder,
        },
        newValue: {
          autoApprovalEnabled: updated.autoApprovalEnabled,
          autoApprovalDelayHours: updated.autoApprovalDelayHours,
          description: updated.description,
          isActive: updated.isActive,
          location: updated.location,
          name: updated.name,
          sortOrder: updated.sortOrder,
        },
      },
    });

    return updated;
  });
}

export async function setMeetingRoomActiveStatus(input: {
  adminId: string;
  roomId: string;
  isActive: boolean;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.meetingRoom.findUnique({
      where: { id: input.roomId },
      select: { id: true, isActive: true, deletedAt: true },
    });

    if (!current || current.deletedAt) {
      throw new AdminSettingsError("Meeting room was not found.");
    }

    const updated = await tx.meetingRoom.update({
      where: { id: current.id },
      data: { isActive: input.isActive },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "MeetingRoom",
        entityId: updated.id,
        action: "MEETING_ROOM_ACTIVE_STATUS_CHANGED",
        oldValue: { isActive: current.isActive },
        newValue: { isActive: updated.isActive },
      },
    });

    return updated;
  });
}

export async function deleteMeetingRoom(input: {
  adminId: string;
  roomId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.meetingRoom.findUnique({
      where: { id: input.roomId },
      select: { id: true, name: true, deletedAt: true },
    });

    if (!current || current.deletedAt) {
      throw new AdminSettingsError("Meeting room was not found.");
    }

    const deletedAt = new Date();
    const deletedFutureReservations = await tx.meetingRoomReservation.deleteMany({
      where: {
        roomId: current.id,
        startAt: { gte: deletedAt },
      },
    });

    await tx.meetingRoom.update({
      where: { id: current.id },
      data: { deletedAt, isActive: false },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "MeetingRoom",
        entityId: current.id,
        action: "MEETING_ROOM_DELETED",
        oldValue: { name: current.name },
        newValue: {
          deletedAt: deletedAt.toISOString(),
          deletedFutureReservations: deletedFutureReservations.count,
          name: current.name,
        },
      },
    });

    return { deletedFutureReservations: deletedFutureReservations.count };
  });
}

export async function updateMeetingRoomWeeklySchedule(input: {
  adminId: string;
  scheduleId: string;
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
}) {
  const workingHours = assertWorkingHours(
    input,
    (message) => new AdminSettingsError(message),
  );

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.meetingRoomWeeklySchedule.findUnique({
      where: { id: input.scheduleId },
    });

    if (!current) {
      throw new AdminSettingsError("Meeting room weekly schedule was not found.");
    }

    const updated = await tx.meetingRoomWeeklySchedule.update({
      where: { id: current.id },
      data: {
        endTime: workingHours.endTime ?? current.endTime,
        isWorkingDay: input.isWorkingDay,
        startTime: workingHours.startTime ?? current.startTime,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "MeetingRoomWeeklySchedule",
        entityId: updated.id,
        action: "MEETING_ROOM_SCHEDULE_CHANGED",
        oldValue: {
          dayOfWeek: current.dayOfWeek,
          endTime: current.endTime,
          isWorkingDay: current.isWorkingDay,
          roomId: current.roomId,
          startTime: current.startTime,
        },
        newValue: {
          dayOfWeek: updated.dayOfWeek,
          endTime: updated.endTime,
          isWorkingDay: updated.isWorkingDay,
          roomId: updated.roomId,
          startTime: updated.startTime,
        },
      },
    });

    return updated;
  });
}

export async function createMeetingRoomScheduleException(input: {
  adminId: string;
  roomId: string;
  date: Date;
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}) {
  const workingHours = assertWorkingHours(
    input,
    (message) => new AdminSettingsError(message),
  );
  const exceptionDate = startOfLocalDay(input.date);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const room = await tx.meetingRoom.findUnique({
      where: { id: input.roomId },
      select: { id: true },
    });

    if (!room) {
      throw new AdminSettingsError("Meeting room was not found.");
    }

    const exception = await tx.meetingRoomScheduleException.create({
      data: {
        date: exceptionDate,
        endTime: workingHours.endTime,
        isWorkingDay: input.isWorkingDay,
        reason: input.reason?.trim() || null,
        roomId: input.roomId,
        startTime: workingHours.startTime,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "MeetingRoomScheduleException",
        entityId: exception.id,
        action: "MEETING_ROOM_EXCEPTION_CREATED",
        newValue: {
          date: exception.date.toISOString(),
          endTime: exception.endTime,
          isWorkingDay: exception.isWorkingDay,
          reason: exception.reason,
          roomId: exception.roomId,
          startTime: exception.startTime,
        },
      },
    });

    return exception;
  });
}

export async function updateMeetingRoomScheduleException(input: {
  adminId: string;
  exceptionId: string;
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}) {
  const workingHours = assertWorkingHours(
    input,
    (message) => new AdminSettingsError(message),
  );

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.meetingRoomScheduleException.findUnique({
      where: { id: input.exceptionId },
    });

    if (!current) {
      throw new AdminSettingsError("Meeting room exception was not found.");
    }

    const updated = await tx.meetingRoomScheduleException.update({
      where: { id: current.id },
      data: {
        endTime: workingHours.endTime,
        isWorkingDay: input.isWorkingDay,
        reason: input.reason?.trim() || null,
        startTime: workingHours.startTime,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "MeetingRoomScheduleException",
        entityId: updated.id,
        action: "MEETING_ROOM_EXCEPTION_UPDATED",
        oldValue: {
          date: current.date.toISOString(),
          endTime: current.endTime,
          isWorkingDay: current.isWorkingDay,
          reason: current.reason,
          roomId: current.roomId,
          startTime: current.startTime,
        },
        newValue: {
          date: updated.date.toISOString(),
          endTime: updated.endTime,
          isWorkingDay: updated.isWorkingDay,
          reason: updated.reason,
          roomId: updated.roomId,
          startTime: updated.startTime,
        },
      },
    });

    return updated;
  });
}

export async function deleteMeetingRoomScheduleException(input: {
  adminId: string;
  exceptionId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.meetingRoomScheduleException.findUnique({
      where: { id: input.exceptionId },
    });

    if (!current) {
      throw new AdminSettingsError("Meeting room exception was not found.");
    }

    await tx.meetingRoomScheduleException.delete({
      where: { id: current.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "MeetingRoomScheduleException",
        entityId: current.id,
        action: "MEETING_ROOM_EXCEPTION_DELETED",
        oldValue: {
          date: current.date.toISOString(),
          endTime: current.endTime,
          isWorkingDay: current.isWorkingDay,
          reason: current.reason,
          roomId: current.roomId,
          startTime: current.startTime,
        },
      },
    });
  });
}
