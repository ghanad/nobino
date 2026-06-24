import "server-only";

import { Prisma, ReservationStatus, UserRole } from "@prisma/client";

import {
  findCapacityReductionBlocks,
  findDailyCapacityReductionBlocks,
} from "@/lib/admin-settings-service/capacity-reduction";
import {
  assertWorkingHours,
  startOfLocalDay,
} from "@/lib/admin-settings-service/date-time";
import { formatBlockingSlots } from "@/lib/admin-settings-service/formatting";
import { db } from "@/lib/db";
import { getIranHolidaysForJalaliYear } from "@/lib/iran-holidays";

type DbClient = typeof db | Prisma.TransactionClient;

export class AdminSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminSettingsError";
  }
}

const BALE_CHAT_ID_PATTERN = /^-?\d+$/;
const BALE_CHAT_ID_MAX_LENGTH = 100;

export function normalizeBaleChatId(chatId: string | null | undefined): string | null {
  if (typeof chatId === "string" && chatId.trim().length === 0) {
    throw new AdminSettingsError("شناسه گفت‌وگوی بله معتبر نیست.");
  }

  const value = chatId?.trim() || null;

  if (!value) {
    return null;
  }

  if (value.length > BALE_CHAT_ID_MAX_LENGTH || !BALE_CHAT_ID_PATTERN.test(value)) {
    throw new AdminSettingsError("شناسه گفت‌وگوی بله معتبر نیست.");
  }

  return value;
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
  autoAcceptDelayHours?: number;
  autoAcceptEnabled?: boolean;
  dailyUserHourLimit: number;
  oneReservationPerDayEnabled: boolean;
}) {
  const autoAcceptDelayHours = input.autoAcceptDelayHours ?? 4;
  const autoAcceptEnabled = input.autoAcceptEnabled ?? false;

  if (input.dailyUserHourLimit < 1 || input.dailyUserHourLimit > 24) {
    throw new AdminSettingsError(
      "Daily user reservation limit must be between 1 and 24 hours.",
    );
  }

  if (
    autoAcceptDelayHours < 1 ||
    autoAcceptDelayHours > 24
  ) {
    throw new AdminSettingsError(
      "Automatic approval delay must be between 1 and 24 hours.",
    );
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.reservationPolicy.upsert({
      where: { id: "default" },
      update: {},
      create: {
        autoAcceptDelayHours: 4,
        autoAcceptEnabled: false,
        id: "default",
        dailyUserHourLimit: 3,
        oneReservationPerDayEnabled: true,
      },
    });

    if (!autoAcceptEnabled) {
      await tx.reservation.updateMany({
        where: {
          status: ReservationStatus.PENDING,
          autoAcceptAt: { not: null },
        },
        data: {
          autoAcceptAt: null,
        },
      });
    }

    const updated = await tx.reservationPolicy.update({
      where: { id: current.id },
      data: {
        autoAcceptDelayHours,
        autoAcceptEnabled,
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
          autoAcceptDelayHours: current.autoAcceptDelayHours,
          autoAcceptEnabled: current.autoAcceptEnabled,
          dailyUserHourLimit: current.dailyUserHourLimit,
          oneReservationPerDayEnabled: current.oneReservationPerDayEnabled,
        },
        newValue: {
          autoAcceptDelayHours: updated.autoAcceptDelayHours,
          autoAcceptEnabled: updated.autoAcceptEnabled,
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
  const workingHours = assertWorkingHours(
    input,
    (message) => new AdminSettingsError(message),
  );

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
  const workingHours = assertWorkingHours(
    input,
    (message) => new AdminSettingsError(message),
  );
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
  const workingHours = assertWorkingHours(
    input,
    (message) => new AdminSettingsError(message),
  );

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

export async function createBaleLunchReportRecipient(input: {
  adminId: string;
  name: string;
  chatId?: string | null;
  userId?: string | null;
}) {
  const name = input.name.trim();
  const chatId = normalizeBaleChatId(input.chatId);
  const userId = input.userId?.trim() || null;

  if (!name) {
    throw new AdminSettingsError("نام گیرنده گزارش ناهار الزامی است.");
  }

  if (Boolean(chatId) === Boolean(userId)) {
    throw new AdminSettingsError("یک گفت‌وگوی بله یا یک کاربر متصل را انتخاب کنید.");
  }

  try {
    return await db.$transaction(async (tx) => {
      await assertAdmin(input.adminId, tx);

      if (userId) {
        const user = await tx.user.findFirst({
          where: {
            id: userId,
            active: true,
            deletedAt: null,
            baleConnection: { enabled: true },
          },
          select: { id: true },
        });

        if (!user) {
          throw new AdminSettingsError("کاربر انتخاب‌شده اتصال فعال بله ندارد.");
        }
      }

      const recipient = await tx.baleLunchReportRecipient.create({
        data: {
          name,
          chatId,
          userId,
          active: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: input.adminId,
          entityType: "BaleLunchReportRecipient",
          entityId: recipient.id,
          action: "BALE_LUNCH_REPORT_RECIPIENT_CREATED",
          newValue: {
            active: recipient.active,
            chatId: recipient.chatId,
            name: recipient.name,
            userId: recipient.userId,
          },
        },
      });

      return recipient;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AdminSettingsError("این مقصد قبلاً به‌عنوان گیرنده ثبت شده است.");
    }

    throw error;
  }
}

export async function updateBaleLunchReportRecipient(input: {
  adminId: string;
  recipientId: string;
  name: string;
  chatId?: string | null;
  userId?: string | null;
  active: boolean;
}) {
  const name = input.name.trim();
  const chatId = normalizeBaleChatId(input.chatId);
  const userId = input.userId?.trim() || null;

  if (!name) {
    throw new AdminSettingsError("نام گیرنده گزارش ناهار الزامی است.");
  }

  if (Boolean(chatId) === Boolean(userId)) {
    throw new AdminSettingsError("یک گفت‌وگوی بله یا یک کاربر متصل را انتخاب کنید.");
  }

  try {
    return await db.$transaction(async (tx) => {
      await assertAdmin(input.adminId, tx);

      if (userId) {
        const user = await tx.user.findFirst({
          where: {
            id: userId,
            ...(input.active
              ? {
                  active: true,
                  deletedAt: null,
                  baleConnection: { enabled: true },
                }
              : {}),
          },
          select: { id: true },
        });

        if (!user) {
          throw new AdminSettingsError(
            input.active
              ? "کاربر انتخاب‌شده اتصال فعال بله ندارد."
              : "کاربر انتخاب‌شده پیدا نشد.",
          );
        }
      }

      const current = await tx.baleLunchReportRecipient.findUnique({
        where: { id: input.recipientId },
        select: {
          id: true,
          active: true,
          chatId: true,
          name: true,
          userId: true,
        },
      });

      if (!current) {
        throw new AdminSettingsError("گیرنده گزارش ناهار پیدا نشد.");
      }

      const updated = await tx.baleLunchReportRecipient.update({
        where: { id: current.id },
        data: {
          active: input.active,
          chatId,
          name,
          userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: input.adminId,
          entityType: "BaleLunchReportRecipient",
          entityId: updated.id,
          action: "BALE_LUNCH_REPORT_RECIPIENT_UPDATED",
          oldValue: current,
          newValue: {
            active: updated.active,
            chatId: updated.chatId,
            name: updated.name,
            userId: updated.userId,
          },
        },
      });

      return updated;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AdminSettingsError("این مقصد قبلاً به‌عنوان گیرنده ثبت شده است.");
    }

    throw error;
  }
}

export async function deleteBaleLunchReportRecipient(input: {
  adminId: string;
  recipientId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.baleLunchReportRecipient.findUnique({
      where: { id: input.recipientId },
      select: {
        id: true,
        active: true,
        chatId: true,
        name: true,
        userId: true,
      },
    });

    if (!current) {
      throw new AdminSettingsError("گیرنده گزارش ناهار پیدا نشد.");
    }

    // Keep delivery history while removing its optional link to the recipient.
    await tx.baleLunchReportDelivery.updateMany({
      where: { recipientId: current.id },
      data: { recipientId: null },
    });

    await tx.baleLunchReportRecipient.delete({
      where: { id: current.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "BaleLunchReportRecipient",
        entityId: current.id,
        action: "BALE_LUNCH_REPORT_RECIPIENT_DELETED",
        oldValue: current,
      },
    });
  });
}
