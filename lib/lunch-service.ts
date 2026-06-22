import "server-only";

import { LunchReservationStatus, UserRole, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";

type DbClient = typeof db | Prisma.TransactionClient;

const DEFAULT_MAX_ADVANCE_DAYS = 7;
const DEFAULT_CUTOFF_TIME = "23:59";
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class LunchReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LunchReservationError";
  }
}

export function startOfLocalDay(date: Date): Date {
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

export function addDays(date: Date, days: number): Date {
  const day = startOfLocalDay(date);

  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

function assertTime(value: string): void {
  if (!TIME_PATTERN.test(value)) {
    throw new LunchReservationError("زمان باید با قالب HH:mm وارد شود.");
  }
}

function parseTime(value: string): { hour: number; minute: number } {
  assertTime(value);
  const [hour, minute] = value.split(":").map(Number);

  return { hour, minute };
}

export function buildCutoffAt(date: Date, cutoffTime: string): Date {
  const { hour, minute } = parseTime(cutoffTime);
  const previousDay = addDays(date, -1);

  return new Date(
    previousDay.getFullYear(),
    previousDay.getMonth(),
    previousDay.getDate(),
    hour,
    minute,
    0,
    0,
  );
}

async function assertAdmin(adminId: string, client: DbClient = db) {
  const user = await client.user.findUnique({
    where: { id: adminId },
    select: { active: true, role: true },
  });

  if (!user?.active || user.role !== UserRole.ADMIN) {
    throw new LunchReservationError("فقط مدیر سیستم می‌تواند تنظیمات ناهار را تغییر دهد.");
  }
}

export async function getLunchSettings(client: DbClient = db) {
  const settings = await client.lunchSettings.findUnique({
    where: { id: "default" },
  });

  return {
    id: "default",
    enabled: settings?.enabled ?? true,
    maxAdvanceDays: settings?.maxAdvanceDays ?? DEFAULT_MAX_ADVANCE_DAYS,
    cutoffTime: settings?.cutoffTime ?? DEFAULT_CUTOFF_TIME,
  };
}

export async function isLunchServiceDay(
  date: Date,
  client: DbClient = db,
): Promise<boolean> {
  const day = startOfLocalDay(date);
  const exception = await client.lunchException.findUnique({
    where: { date: day },
    select: { isServiceDay: true },
  });

  if (exception) {
    return exception.isServiceDay;
  }

  const weeklySchedule = await client.lunchWeeklySchedule.findUnique({
    where: { dayOfWeek: day.getDay() },
    select: { isServiceDay: true },
  });

  return weeklySchedule?.isServiceDay ?? day.getDay() !== 5;
}

async function assertLunchDateIsReservable(input: {
  date: Date;
  now?: Date;
  client: DbClient;
}): Promise<void> {
  const now = input.now ?? new Date();
  const day = startOfLocalDay(input.date);
  const today = startOfLocalDay(now);
  const settings = await getLunchSettings(input.client);

  if (!settings.enabled) {
    throw new LunchReservationError("رزرو ناهار فعلا غیرفعال است.");
  }

  if (day < today) {
    throw new LunchReservationError("امکان رزرو ناهار برای روزهای گذشته وجود ندارد.");
  }

  if (day > addDays(today, settings.maxAdvanceDays)) {
    throw new LunchReservationError("این تاریخ خارج از بازه مجاز رزرو ناهار است.");
  }

  if (!(await isLunchServiceDay(day, input.client))) {
    throw new LunchReservationError("برای این تاریخ سرویس ناهار فعال نیست.");
  }

  if (now >= buildCutoffAt(day, settings.cutoffTime)) {
    throw new LunchReservationError("مهلت رزرو، تغییر یا لغو ناهار برای این تاریخ گذشته است.");
  }
}

async function assertActiveLocation(locationId: string, client: DbClient) {
  const location = await client.lunchLocation.findUnique({
    where: { id: locationId },
    select: { id: true, active: true },
  });

  if (!location?.active) {
    throw new LunchReservationError("ساختمان انتخاب‌شده فعال نیست.");
  }
}

export async function getLunchReservationWindow(now: Date = new Date()) {
  const settings = await getLunchSettings();
  const today = startOfLocalDay(now);

  return Array.from({ length: settings.maxAdvanceDays + 1 }, (_, index) =>
    addDays(today, index),
  );
}

export async function createLunchReservation(input: {
  userId: string;
  locationId: string;
  date: Date;
  now?: Date;
}) {
  const date = startOfLocalDay(input.date);

  return db.$transaction(async (tx) => {
    await assertLunchDateIsReservable({ date, now: input.now, client: tx });
    await assertActiveLocation(input.locationId, tx);

    const existing = await tx.lunchReservation.findFirst({
      where: {
        userId: input.userId,
        date,
        status: LunchReservationStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (existing) {
      throw new LunchReservationError("برای این روز قبلا ناهار رزرو کرده‌اید.");
    }

    const reservation = await tx.lunchReservation.create({
      data: {
        userId: input.userId,
        locationId: input.locationId,
        date,
        status: LunchReservationStatus.ACTIVE,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "LunchReservation",
        entityId: reservation.id,
        action: "LUNCH_RESERVATION_CREATED",
        newValue: {
          userId: reservation.userId,
          locationId: reservation.locationId,
          date: reservation.date.toISOString(),
          status: reservation.status,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: input.userId,
        lunchReservationId: reservation.id,
        type: "LUNCH_RESERVED",
        title: "رزرو ناهار ثبت شد",
        body: "رزرو ناهار شما ثبت شد.",
      },
    });

    return reservation;
  });
}

export async function updateLunchReservationLocation(input: {
  reservationId: string;
  userId: string;
  locationId: string;
  now?: Date;
}) {
  return db.$transaction(async (tx) => {
    const current = await tx.lunchReservation.findUnique({
      where: { id: input.reservationId },
    });

    if (
      !current ||
      current.userId !== input.userId ||
      current.status !== LunchReservationStatus.ACTIVE
    ) {
      throw new LunchReservationError("رزرو ناهار پیدا نشد.");
    }

    await assertLunchDateIsReservable({
      date: current.date,
      now: input.now,
      client: tx,
    });
    await assertActiveLocation(input.locationId, tx);

    const updated = await tx.lunchReservation.update({
      where: { id: current.id },
      data: { locationId: input.locationId },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "LunchReservation",
        entityId: updated.id,
        action: "LUNCH_RESERVATION_UPDATED",
        oldValue: {
          locationId: current.locationId,
        },
        newValue: {
          locationId: updated.locationId,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: input.userId,
        lunchReservationId: updated.id,
        type: "LUNCH_UPDATED",
        title: "رزرو ناهار تغییر کرد",
        body: "محل دریافت ناهار شما تغییر کرد.",
      },
    });

    return updated;
  });
}

export async function cancelLunchReservationByUser(input: {
  reservationId: string;
  userId: string;
  now?: Date;
}) {
  return db.$transaction(async (tx) => {
    const current = await tx.lunchReservation.findUnique({
      where: { id: input.reservationId },
    });

    if (
      !current ||
      current.userId !== input.userId ||
      current.status !== LunchReservationStatus.ACTIVE
    ) {
      throw new LunchReservationError("رزرو ناهار پیدا نشد.");
    }

    await assertLunchDateIsReservable({
      date: current.date,
      now: input.now,
      client: tx,
    });

    const cancelled = await tx.lunchReservation.update({
      where: { id: current.id },
      data: {
        status: LunchReservationStatus.CANCELLED_BY_USER,
        cancelledAt: input.now ?? new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "LunchReservation",
        entityId: cancelled.id,
        action: "LUNCH_RESERVATION_CANCELLED_BY_USER",
        oldValue: {
          status: current.status,
        },
        newValue: {
          status: cancelled.status,
          cancelledAt: cancelled.cancelledAt?.toISOString() ?? null,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: input.userId,
        lunchReservationId: cancelled.id,
        type: "LUNCH_CANCELLED",
        title: "رزرو ناهار لغو شد",
        body: "رزرو ناهار شما لغو شد.",
      },
    });

    return cancelled;
  });
}

export async function updateLunchSettings(input: {
  adminId: string;
  enabled: boolean;
  maxAdvanceDays: number;
  cutoffTime: string;
}) {
  if (input.maxAdvanceDays < 1 || input.maxAdvanceDays > 31) {
    throw new LunchReservationError("بازه رزرو ناهار باید بین ۱ تا ۳۱ روز باشد.");
  }

  assertTime(input.cutoffTime);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchSettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        enabled: true,
        maxAdvanceDays: DEFAULT_MAX_ADVANCE_DAYS,
        cutoffTime: DEFAULT_CUTOFF_TIME,
      },
    });

    const updated = await tx.lunchSettings.update({
      where: { id: current.id },
      data: {
        enabled: input.enabled,
        maxAdvanceDays: input.maxAdvanceDays,
        cutoffTime: input.cutoffTime,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchSettings",
        entityId: updated.id,
        action: "LUNCH_SETTINGS_CHANGED",
        oldValue: {
          enabled: current.enabled,
          maxAdvanceDays: current.maxAdvanceDays,
          cutoffTime: current.cutoffTime,
        },
        newValue: {
          enabled: updated.enabled,
          maxAdvanceDays: updated.maxAdvanceDays,
          cutoffTime: updated.cutoffTime,
        },
      },
    });

    return updated;
  });
}

export async function createLunchLocation(input: {
  adminId: string;
  name: string;
}) {
  const name = input.name.trim();

  if (!name) {
    throw new LunchReservationError("نام ساختمان الزامی است.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const existing = await tx.lunchLocation.findUnique({
      where: { name },
      select: { id: true },
    });

    if (existing) {
      throw new LunchReservationError("ساختمانی با این نام قبلا ثبت شده است.");
    }

    const location = await tx.lunchLocation.create({
      data: { name, active: true },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchLocation",
        entityId: location.id,
        action: "LUNCH_LOCATION_CREATED",
        newValue: { name: location.name, active: location.active },
      },
    });

    return location;
  });
}

export async function updateLunchLocation(input: {
  adminId: string;
  locationId: string;
  name: string;
  active: boolean;
}) {
  const name = input.name.trim();

  if (!name) {
    throw new LunchReservationError("نام ساختمان الزامی است.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchLocation.findUnique({
      where: { id: input.locationId },
    });

    if (!current) {
      throw new LunchReservationError("ساختمان پیدا نشد.");
    }

    const duplicate = await tx.lunchLocation.findUnique({
      where: { name },
      select: { id: true },
    });

    if (duplicate && duplicate.id !== current.id) {
      throw new LunchReservationError("ساختمانی با این نام قبلا ثبت شده است.");
    }

    const updated = await tx.lunchLocation.update({
      where: { id: current.id },
      data: { name, active: input.active },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchLocation",
        entityId: updated.id,
        action: "LUNCH_LOCATION_UPDATED",
        oldValue: { name: current.name, active: current.active },
        newValue: { name: updated.name, active: updated.active },
      },
    });

    return updated;
  });
}

export async function deleteLunchLocation(input: {
  adminId: string;
  locationId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchLocation.findUnique({
      where: { id: input.locationId },
    });

    if (!current) {
      throw new LunchReservationError("ساختمان پیدا نشد.");
    }

    const usageCount = await tx.lunchReservation.count({
      where: { locationId: current.id },
    });

    if (usageCount > 0) {
      throw new LunchReservationError(
        "این ساختمان در گزارش‌های قبلی استفاده شده و باید به جای حذف، غیرفعال شود.",
      );
    }

    await tx.lunchLocation.delete({ where: { id: current.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchLocation",
        entityId: current.id,
        action: "LUNCH_LOCATION_DELETED",
        oldValue: { name: current.name, active: current.active },
      },
    });
  });
}

export async function updateLunchWeeklySchedule(input: {
  adminId: string;
  scheduleId: string;
  isServiceDay: boolean;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchWeeklySchedule.findUnique({
      where: { id: input.scheduleId },
    });

    if (!current) {
      throw new LunchReservationError("روز برنامه هفتگی پیدا نشد.");
    }

    const updated = await tx.lunchWeeklySchedule.update({
      where: { id: current.id },
      data: { isServiceDay: input.isServiceDay },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchWeeklySchedule",
        entityId: updated.id,
        action: "LUNCH_WEEKLY_SCHEDULE_CHANGED",
        oldValue: {
          dayOfWeek: current.dayOfWeek,
          isServiceDay: current.isServiceDay,
        },
        newValue: {
          dayOfWeek: updated.dayOfWeek,
          isServiceDay: updated.isServiceDay,
        },
      },
    });

    return updated;
  });
}

export async function createLunchException(input: {
  adminId: string;
  date: Date;
  isServiceDay: boolean;
  reason?: string | null;
}) {
  const date = startOfLocalDay(input.date);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const existing = await tx.lunchException.findUnique({
      where: { date },
      select: { id: true },
    });

    if (existing) {
      throw new LunchReservationError("برای این تاریخ قبلا استثنای ناهار ثبت شده است.");
    }

    const exception = await tx.lunchException.create({
      data: {
        date,
        isServiceDay: input.isServiceDay,
        reason: input.reason?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchException",
        entityId: exception.id,
        action: "LUNCH_EXCEPTION_CREATED",
        newValue: {
          date: exception.date.toISOString(),
          isServiceDay: exception.isServiceDay,
          reason: exception.reason,
        },
      },
    });

    return exception;
  });
}

export async function updateLunchException(input: {
  adminId: string;
  exceptionId: string;
  isServiceDay: boolean;
  reason?: string | null;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchException.findUnique({
      where: { id: input.exceptionId },
    });

    if (!current) {
      throw new LunchReservationError("استثنای ناهار پیدا نشد.");
    }

    const updated = await tx.lunchException.update({
      where: { id: current.id },
      data: {
        isServiceDay: input.isServiceDay,
        reason: input.reason?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchException",
        entityId: updated.id,
        action: "LUNCH_EXCEPTION_UPDATED",
        oldValue: {
          date: current.date.toISOString(),
          isServiceDay: current.isServiceDay,
          reason: current.reason,
        },
        newValue: {
          date: updated.date.toISOString(),
          isServiceDay: updated.isServiceDay,
          reason: updated.reason,
        },
      },
    });

    return updated;
  });
}

export async function deleteLunchException(input: {
  adminId: string;
  exceptionId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.lunchException.findUnique({
      where: { id: input.exceptionId },
    });

    if (!current) {
      throw new LunchReservationError("استثنای ناهار پیدا نشد.");
    }

    await tx.lunchException.delete({ where: { id: current.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "LunchException",
        entityId: current.id,
        action: "LUNCH_EXCEPTION_DELETED",
        oldValue: {
          date: current.date.toISOString(),
          isServiceDay: current.isServiceDay,
          reason: current.reason,
        },
      },
    });
  });
}

export async function getLunchReport(date: Date) {
  const day = startOfLocalDay(date);

  return db.lunchReservation.findMany({
    where: {
      date: day,
      status: LunchReservationStatus.ACTIVE,
    },
    orderBy: [
      { location: { name: "asc" } },
      { user: { name: "asc" } },
    ],
    select: {
      id: true,
      date: true,
      location: {
        select: {
          id: true,
          name: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      createdAt: true,
    },
  });
}

export async function getLunchDayState(input: {
  date: Date;
  now?: Date;
}) {
  const date = startOfLocalDay(input.date);
  const settings = await getLunchSettings();
  const isServiceDay = await isLunchServiceDay(date);
  const cutoffAt = buildCutoffAt(date, settings.cutoffTime);
  const now = input.now ?? new Date();

  return {
    date,
    cutoffAt,
    isOpen:
      settings.enabled &&
      isServiceDay &&
      date >= startOfLocalDay(now) &&
      date <= addDays(startOfLocalDay(now), settings.maxAdvanceDays) &&
      now < cutoffAt,
    isServiceDay,
  };
}
