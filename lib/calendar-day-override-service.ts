import "server-only";

import {
  CalendarDayOverrideMode,
  CalendarDayTargetType,
  type Prisma,
} from "@prisma/client";

import { assertWorkingHours, startOfLocalDay } from "@/lib/admin-settings-service/date-time";
import {
  AdminSettingsError,
  assertAdmin,
  type DbClient,
} from "@/lib/admin-settings-service/shared";
import { db } from "@/lib/db";

export const GLOBAL_CALENDAR_TARGET_KEY = "global";

export type CalendarDayOverrideTargetInput = {
  targetKey: string;
  type: CalendarDayTargetType;
};

type CalendarDayOverrideInput = {
  adminId: string;
  date: Date;
  endTime?: string | null;
  mode: CalendarDayOverrideMode;
  reason?: string | null;
  startTime?: string | null;
  targets: CalendarDayOverrideTargetInput[];
};

function normalizeTargets(targets: CalendarDayOverrideTargetInput[]) {
  if (targets.length === 0) {
    throw new AdminSettingsError("حداقل یک سرویس را انتخاب کنید.");
  }

  const normalized = targets.map((target) => ({
    type: target.type,
    targetKey: target.targetKey.trim(),
  }));
  const uniqueKeys = new Set(
    normalized.map((target) => `${target.type}:${target.targetKey}`),
  );

  if (
    normalized.some((target) => !target.targetKey) ||
    uniqueKeys.size !== normalized.length
  ) {
    throw new AdminSettingsError("محدوده سرویس‌های انتخاب‌شده معتبر نیست.");
  }

  for (const target of normalized) {
    if (
      (target.type === CalendarDayTargetType.SYSTEMS ||
        target.type === CalendarDayTargetType.LUNCH) &&
      target.targetKey !== GLOBAL_CALENDAR_TARGET_KEY
    ) {
      throw new AdminSettingsError("محدوده سراسری سرویس معتبر نیست.");
    }
  }

  return normalized;
}

function normalizeWindow(input: {
  endTime?: string | null;
  mode: CalendarDayOverrideMode;
  startTime?: string | null;
  targets: CalendarDayOverrideTargetInput[];
}) {
  if (input.mode !== CalendarDayOverrideMode.CUSTOM) {
    return { endTime: null, startTime: null };
  }

  const hasTimedTarget = input.targets.some(
    (target) => target.type !== CalendarDayTargetType.LUNCH,
  );

  if (!hasTimedTarget) {
    return { endTime: null, startTime: null };
  }

  return assertWorkingHours(
    {
      endTime: input.endTime,
      isWorkingDay: true,
      startTime: input.startTime,
    },
    () =>
      new AdminSettingsError(
        "برای برنامه ویژه، ساعت شروع و پایان را روی ابتدای ساعت وارد کنید.",
      ),
  );
}

async function assertTargetsExist(
  targets: CalendarDayOverrideTargetInput[],
  client: Prisma.TransactionClient,
) {
  const buildingIds = targets
    .filter((target) => target.type === CalendarDayTargetType.BUILDING)
    .map((target) => target.targetKey);
  const roomIds = targets
    .filter((target) => target.type === CalendarDayTargetType.MEETING_ROOM)
    .map((target) => target.targetKey);

  const [buildingCount, roomCount] = await Promise.all([
    buildingIds.length
      ? client.building.count({
          where: { active: true, deletedAt: null, id: { in: buildingIds } },
        })
      : 0,
    roomIds.length
      ? client.meetingRoom.count({
          where: { isActive: true, deletedAt: null, id: { in: roomIds } },
        })
      : 0,
  ]);

  if (buildingCount !== buildingIds.length || roomCount !== roomIds.length) {
    throw new AdminSettingsError("یکی از دفترها یا اتاق‌های انتخاب‌شده فعال نیست.");
  }
}

function auditValue(input: {
  date: Date;
  endTime: string | null;
  mode: CalendarDayOverrideMode;
  reason: string | null;
  startTime: string | null;
  targets: CalendarDayOverrideTargetInput[];
}) {
  return {
    date: input.date.toISOString(),
    endTime: input.endTime,
    mode: input.mode,
    reason: input.reason,
    startTime: input.startTime,
    targets: input.targets,
  };
}

export async function getCalendarDayOverride(
  input: {
    date: Date;
    targetKey: string;
    type: CalendarDayTargetType;
  },
  client: DbClient = db,
) {
  return client.calendarDayOverride.findFirst({
    where: {
      date: startOfLocalDay(input.date),
      targets: {
        some: { targetKey: input.targetKey, type: input.type },
      },
    },
    select: {
      endTime: true,
      mode: true,
      reason: true,
      startTime: true,
    },
  });
}

export async function createCalendarDayOverride(
  input: CalendarDayOverrideInput,
) {
  const targets = normalizeTargets(input.targets);
  const window = normalizeWindow({ ...input, targets });
  const date = startOfLocalDay(input.date);
  const reason = input.reason?.trim() || null;

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    await assertTargetsExist(targets, tx);

    if (await tx.calendarDayOverride.findUnique({ where: { date } })) {
      throw new AdminSettingsError("برای این تاریخ قبلاً اصلاح مرکزی ثبت شده است.");
    }

    const override = await tx.calendarDayOverride.create({
      data: {
        createdById: input.adminId,
        date,
        endTime: window.endTime,
        mode: input.mode,
        reason,
        startTime: window.startTime,
        targets: { create: targets },
      },
      include: { targets: true },
    });

    await tx.auditLog.create({
      data: {
        action: "CALENDAR_DAY_OVERRIDE_CREATED",
        actorUserId: input.adminId,
        entityId: override.id,
        entityType: "CalendarDayOverride",
        newValue: auditValue({
          date,
          endTime: override.endTime,
          mode: override.mode,
          reason: override.reason,
          startTime: override.startTime,
          targets,
        }),
      },
    });

    return override;
  });
}

export async function updateCalendarDayOverride(
  input: Omit<CalendarDayOverrideInput, "date"> & { overrideId: string },
) {
  const targets = normalizeTargets(input.targets);
  const window = normalizeWindow({ ...input, targets });
  const reason = input.reason?.trim() || null;

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    await assertTargetsExist(targets, tx);

    const current = await tx.calendarDayOverride.findUnique({
      where: { id: input.overrideId },
      include: { targets: true },
    });

    if (!current) {
      throw new AdminSettingsError("اصلاح تقویم پیدا نشد.");
    }

    const updated = await tx.calendarDayOverride.update({
      where: { id: current.id },
      data: {
        endTime: window.endTime,
        mode: input.mode,
        reason,
        startTime: window.startTime,
        targets: {
          deleteMany: {},
          create: targets,
        },
      },
      include: { targets: true },
    });

    await tx.auditLog.create({
      data: {
        action: "CALENDAR_DAY_OVERRIDE_UPDATED",
        actorUserId: input.adminId,
        entityId: updated.id,
        entityType: "CalendarDayOverride",
        oldValue: auditValue({
          date: current.date,
          endTime: current.endTime,
          mode: current.mode,
          reason: current.reason,
          startTime: current.startTime,
          targets: current.targets.map(({ targetKey, type }) => ({
            targetKey,
            type,
          })),
        }),
        newValue: auditValue({
          date: updated.date,
          endTime: updated.endTime,
          mode: updated.mode,
          reason: updated.reason,
          startTime: updated.startTime,
          targets,
        }),
      },
    });

    return updated;
  });
}

export async function deleteCalendarDayOverride(input: {
  adminId: string;
  overrideId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const current = await tx.calendarDayOverride.findUnique({
      where: { id: input.overrideId },
      include: { targets: true },
    });

    if (!current) {
      throw new AdminSettingsError("اصلاح تقویم پیدا نشد.");
    }

    await tx.calendarDayOverride.delete({ where: { id: current.id } });
    await tx.auditLog.create({
      data: {
        action: "CALENDAR_DAY_OVERRIDE_DELETED",
        actorUserId: input.adminId,
        entityId: current.id,
        entityType: "CalendarDayOverride",
        oldValue: auditValue({
          date: current.date,
          endTime: current.endTime,
          mode: current.mode,
          reason: current.reason,
          startTime: current.startTime,
          targets: current.targets.map(({ targetKey, type }) => ({
            targetKey,
            type,
          })),
        }),
      },
    });

    return current;
  });
}
