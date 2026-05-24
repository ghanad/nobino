import "server-only";

import { ReservationStatus, UserRole, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { getIranHolidaysForJalaliYear } from "@/lib/iran-holidays";
import { formatJalaliDateTime } from "@/lib/jalali-date";

const ONE_HOUR_MS = 60 * 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):00$/;

type DbClient = typeof db | Prisma.TransactionClient;

export class AdminSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSettingsError";
  }
}

async function assertAdmin(adminId: string, client: DbClient = db) {
  const user = await client.user.findUnique({
    where: { id: adminId },
    select: { active: true, role: true },
  });

  if (!user?.active || user.role !== UserRole.ADMIN) {
    throw new AdminSettingsError("Only admins can change system settings.");
  }
}

function assertTime(value: string, fieldName: string): void {
  if (!TIME_PATTERN.test(value)) {
    throw new AdminSettingsError(`${fieldName} must be an exact hour like 09:00.`);
  }
}

function assertWorkingHours(input: {
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
}): { startTime: string | null; endTime: string | null } {
  if (!input.isWorkingDay) {
    return { startTime: null, endTime: null };
  }

  if (!input.startTime || !input.endTime) {
    throw new AdminSettingsError("Working days need start and end hours.");
  }

  assertTime(input.startTime, "Start time");
  assertTime(input.endTime, "End time");

  if (input.endTime <= input.startTime) {
    throw new AdminSettingsError("End time must be after start time.");
  }

  return {
    startTime: input.startTime,
    endTime: input.endTime,
  };
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

function buildHourlySlots(startAt: Date, endAt: Date) {
  const slots: Array<{ slotStart: Date; slotEnd: Date }> = [];

  for (
    let slotStartMs = startAt.getTime();
    slotStartMs < endAt.getTime();
    slotStartMs += ONE_HOUR_MS
  ) {
    slots.push({
      slotStart: new Date(slotStartMs),
      slotEnd: new Date(slotStartMs + ONE_HOUR_MS),
    });
  }

  return slots;
}

async function findCapacityReductionBlocks(input: {
  resourcePoolId: string;
  capacity: number;
  client: DbClient;
}) {
  const now = new Date();
  const reservations = await input.client.reservation.findMany({
    where: {
      resourcePoolId: input.resourcePoolId,
      status: ReservationStatus.APPROVED,
      endAt: { gt: now },
    },
    select: {
      startAt: true,
      endAt: true,
    },
  });

  const usageBySlot = new Map<string, { slotStart: Date; count: number }>();
  const capacityExceptions = await input.client.resourcePoolCapacityException.findMany({
    where: {
      resourcePoolId: input.resourcePoolId,
      date: { gte: startOfLocalDay(now) },
    },
    select: {
      date: true,
      capacity: true,
    },
  });
  const capacityByDate = new Map(
    capacityExceptions.map((exception) => [
      exception.date.toISOString(),
      exception.capacity,
    ]),
  );

  for (const reservation of reservations) {
    for (const slot of buildHourlySlots(reservation.startAt, reservation.endAt)) {
      const key = slot.slotStart.toISOString();
      const current = usageBySlot.get(key);

      usageBySlot.set(key, {
        slotStart: slot.slotStart,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  const blocks: Array<{ slotStart: Date; count: number }> = [];

  for (const slot of usageBySlot.values()) {
    const proposedCapacity =
      capacityByDate.get(startOfLocalDay(slot.slotStart).toISOString()) ??
      input.capacity;

    if (slot.count > proposedCapacity) {
      blocks.push(slot);
    }
  }

  return blocks
    .sort((left, right) => left.slotStart.getTime() - right.slotStart.getTime());
}

async function findDailyCapacityReductionBlocks(input: {
  resourcePoolId: string;
  date: Date;
  capacity: number;
  client: DbClient;
}) {
  const dayStart = startOfLocalDay(input.date);
  const dayEnd = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    dayStart.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  const reservations = await input.client.reservation.findMany({
    where: {
      resourcePoolId: input.resourcePoolId,
      status: ReservationStatus.APPROVED,
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
    },
    select: {
      startAt: true,
      endAt: true,
    },
  });

  const usageBySlot = new Map<string, { slotStart: Date; count: number }>();

  for (const reservation of reservations) {
    for (const slot of buildHourlySlots(reservation.startAt, reservation.endAt)) {
      if (slot.slotStart < dayStart || slot.slotStart >= dayEnd) {
        continue;
      }

      const key = slot.slotStart.toISOString();
      const current = usageBySlot.get(key);

      usageBySlot.set(key, {
        slotStart: slot.slotStart,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return [...usageBySlot.values()]
    .filter((slot) => slot.count > input.capacity)
    .sort((left, right) => left.slotStart.getTime() - right.slotStart.getTime());
}

function formatBlockingSlots(
  blocks: Array<{ slotStart: Date; count: number }>,
): string {
  return blocks
    .slice(0, 5)
    .map((slot) => `${formatJalaliDateTime(slot.slotStart)} (${slot.count})`)
    .join(", ");
}

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

export async function updateReservationPolicy(input: {
  adminId: string;
  dailyUserHourLimit: number;
  oneReservationPerDayEnabled: boolean;
}) {
  if (input.dailyUserHourLimit < 1 || input.dailyUserHourLimit > 24) {
    throw new AdminSettingsError(
      "Daily user reservation limit must be between 1 and 24 hours.",
    );
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.reservationPolicy.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        dailyUserHourLimit: 3,
        oneReservationPerDayEnabled: true,
      },
    });

    const updated = await tx.reservationPolicy.update({
      where: { id: current.id },
      data: {
        dailyUserHourLimit: input.dailyUserHourLimit,
        oneReservationPerDayEnabled: input.oneReservationPerDayEnabled,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "ReservationPolicy",
        entityId: updated.id,
        action: "RESERVATION_POLICY_CHANGED",
        oldValue: {
          dailyUserHourLimit: current.dailyUserHourLimit,
          oneReservationPerDayEnabled: current.oneReservationPerDayEnabled,
        },
        newValue: {
          dailyUserHourLimit: updated.dailyUserHourLimit,
          oneReservationPerDayEnabled: updated.oneReservationPerDayEnabled,
        },
      },
    });

    return updated;
  });
}

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

export async function updateWeeklySchedule(input: {
  adminId: string;
  scheduleId: string;
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
}) {
  const workingHours = assertWorkingHours(input);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.workingSchedule.findUnique({
      where: { id: input.scheduleId },
    });

    if (!current) {
      throw new AdminSettingsError("Weekly schedule row was not found.");
    }

    const updated = await tx.workingSchedule.update({
      where: { id: current.id },
      data: {
        isWorkingDay: input.isWorkingDay,
        startTime: workingHours.startTime ?? current.startTime,
        endTime: workingHours.endTime ?? current.endTime,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "WorkingSchedule",
        entityId: updated.id,
        action: "WORKING_SCHEDULE_CHANGED",
        oldValue: {
          dayOfWeek: current.dayOfWeek,
          isWorkingDay: current.isWorkingDay,
          startTime: current.startTime,
          endTime: current.endTime,
        },
        newValue: {
          dayOfWeek: updated.dayOfWeek,
          isWorkingDay: updated.isWorkingDay,
          startTime: updated.startTime,
          endTime: updated.endTime,
        },
      },
    });

    return updated;
  });
}

export async function createScheduleException(input: {
  adminId: string;
  date: Date;
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}) {
  const workingHours = assertWorkingHours(input);
  const exceptionDate = startOfLocalDay(input.date);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const existing = await tx.scheduleException.findFirst({
      where: { date: exceptionDate },
      select: { id: true },
    });

    if (existing) {
      throw new AdminSettingsError(
        "A schedule exception already exists for this date.",
      );
    }

    const exception = await tx.scheduleException.create({
      data: {
        date: exceptionDate,
        isWorkingDay: input.isWorkingDay,
        startTime: workingHours.startTime,
        endTime: workingHours.endTime,
        reason: input.reason?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "ScheduleException",
        entityId: exception.id,
        action: "SCHEDULE_EXCEPTION_CREATED",
        newValue: {
          date: exception.date.toISOString(),
          isWorkingDay: exception.isWorkingDay,
          startTime: exception.startTime,
          endTime: exception.endTime,
          reason: exception.reason,
        },
      },
    });

    return exception;
  });
}

export async function updateScheduleException(input: {
  adminId: string;
  exceptionId: string;
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}) {
  const workingHours = assertWorkingHours(input);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.scheduleException.findUnique({
      where: { id: input.exceptionId },
    });

    if (!current) {
      throw new AdminSettingsError("Schedule exception was not found.");
    }

    const updated = await tx.scheduleException.update({
      where: { id: current.id },
      data: {
        isWorkingDay: input.isWorkingDay,
        startTime: workingHours.startTime,
        endTime: workingHours.endTime,
        reason: input.reason?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "ScheduleException",
        entityId: updated.id,
        action: "SCHEDULE_EXCEPTION_UPDATED",
        oldValue: {
          date: current.date.toISOString(),
          isWorkingDay: current.isWorkingDay,
          startTime: current.startTime,
          endTime: current.endTime,
          reason: current.reason,
        },
        newValue: {
          date: updated.date.toISOString(),
          isWorkingDay: updated.isWorkingDay,
          startTime: updated.startTime,
          endTime: updated.endTime,
          reason: updated.reason,
        },
      },
    });

    return updated;
  });
}

export async function deleteScheduleException(input: {
  adminId: string;
  exceptionId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.scheduleException.findUnique({
      where: { id: input.exceptionId },
    });

    if (!current) {
      throw new AdminSettingsError("Schedule exception was not found.");
    }

    await tx.scheduleException.delete({
      where: { id: current.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "ScheduleException",
        entityId: current.id,
        action: "SCHEDULE_EXCEPTION_DELETED",
        oldValue: {
          date: current.date.toISOString(),
          isWorkingDay: current.isWorkingDay,
          startTime: current.startTime,
          endTime: current.endTime,
          reason: current.reason,
        },
      },
    });
  });
}

export async function importIranHolidayScheduleExceptions(input: {
  adminId: string;
  year: number;
}) {
  if (input.year < 1300 || input.year > 1600) {
    throw new AdminSettingsError("Enter a valid Jalali year.");
  }

  const holidays = await getIranHolidaysForJalaliYear(input.year);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const existingExceptions = await tx.scheduleException.findMany({
      where: {
        date: {
          in: holidays.map((holiday) => startOfLocalDay(holiday.date)),
        },
      },
      select: { date: true },
    });
    const existingDates = new Set(
      existingExceptions.map((exception) => exception.date.toISOString()),
    );
    let createdCount = 0;

    for (const holiday of holidays) {
      const date = startOfLocalDay(holiday.date);

      if (existingDates.has(date.toISOString())) {
        continue;
      }

      const exception = await tx.scheduleException.create({
        data: {
          date,
          isWorkingDay: false,
          startTime: null,
          endTime: null,
          reason: holiday.title,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: input.adminId,
          entityType: "ScheduleException",
          entityId: exception.id,
          action: "SCHEDULE_EXCEPTION_CREATED",
          newValue: {
            date: exception.date.toISOString(),
            importedFrom: "iran_holidays",
            isWorkingDay: exception.isWorkingDay,
            startTime: exception.startTime,
            endTime: exception.endTime,
            reason: exception.reason,
          },
        },
      });

      createdCount += 1;
    }

    return {
      createdCount,
      skippedCount: holidays.length - createdCount,
      totalCount: holidays.length,
    };
  });
}
