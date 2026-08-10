import "server-only";

import { LunchReservationStatus, ReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { formatJalaliDate } from "@/lib/jalali-date";

import { startOfLocalDay } from "./date-time";
import { assertLunchDateIsReservable } from "./service-days";
import {
  assertActiveBuilding,
  assertManagerOrAdmin,
  type DbClient,
  LunchReservationError,
} from "./shared";

function assertAtLeastOneMeal(input: {
  breakfastReserved: boolean;
  lunchReserved: boolean;
}) {
  if (!input.breakfastReserved && !input.lunchReserved) {
    throw new LunchReservationError("حداقل یکی از وعده‌های صبحانه یا ناهار را انتخاب کنید.");
  }
}

function formatLunchReservationDate(date: Date): string {
  return `برای ${formatJalaliDate(date)}`;
}

function assertAtMostOneSource(input: {
  sourceDeskReservationId?: string;
  sourceReservationId?: string;
}) {
  if (input.sourceDeskReservationId && input.sourceReservationId) {
    throw new LunchReservationError("فقط یک رزرو مبدا می‌تواند برای پیشنهاد غذا استفاده شود.");
  }
}

async function assertValidSourceReservation(input: {
  buildingId: string;
  sourceReservationId?: string;
  userId: string;
  date: Date;
  client: DbClient;
}) {
  if (!input.sourceReservationId) {
    return;
  }

  const source = await input.client.reservation.findUnique({
    where: { id: input.sourceReservationId },
    select: {
      userId: true,
      startAt: true,
      status: true,
      resourcePool: { select: { buildingId: true } },
    },
  });

  if (
    !source ||
    source.userId !== input.userId ||
    source.resourcePool.buildingId !== input.buildingId ||
    startOfLocalDay(source.startAt).getTime() !== input.date.getTime() ||
    source.status !== ReservationStatus.PENDING &&
    source.status !== ReservationStatus.APPROVED &&
    source.status !== ReservationStatus.ALTERNATIVE_PROPOSED
  ) {
    throw new LunchReservationError("رزرو سیستم مرتبط با این درخواست غذا معتبر نیست.");
  }
}

async function assertValidSourceDeskReservation(input: {
  buildingId: string;
  sourceDeskReservationId?: string;
  userId: string;
  date: Date;
  client: DbClient;
}) {
  if (!input.sourceDeskReservationId) {
    return;
  }

  const source = await input.client.deskReservation.findUnique({
    where: { id: input.sourceDeskReservationId },
    select: {
      userId: true,
      startAt: true,
      status: true,
      desk: { select: { buildingId: true } },
    },
  });

  if (
    !source ||
    source.userId !== input.userId ||
    source.desk.buildingId !== input.buildingId ||
    startOfLocalDay(source.startAt).getTime() !== input.date.getTime() ||
    (source.status !== ReservationStatus.PENDING &&
      source.status !== ReservationStatus.APPROVED)
  ) {
    throw new LunchReservationError("رزرو میز مرتبط با این درخواست غذا معتبر نیست.");
  }
}

export async function createLunchReservation(input: {
  userId: string;
  buildingId: string;
  date: Date;
  breakfastReserved?: boolean;
  lunchReserved?: boolean;
  sourceReservationId?: string;
  sourceDeskReservationId?: string;
  now?: Date;
}) {
  const date = startOfLocalDay(input.date);
  const breakfastReserved = input.breakfastReserved ?? false;
  const lunchReserved = input.lunchReserved ?? true;

  assertAtLeastOneMeal({ breakfastReserved, lunchReserved });
  assertAtMostOneSource(input);

  return db.$transaction(async (tx) => {
    await assertLunchDateIsReservable({ date, now: input.now, client: tx });
    await assertActiveBuilding(input.buildingId, tx);
    await assertValidSourceReservation({
      buildingId: input.buildingId,
      sourceReservationId: input.sourceReservationId,
      userId: input.userId,
      date,
      client: tx,
    });
    // Desk-originated suggestions are validated at submission time only. The
    // lunch row intentionally stores no desk relation, so moving/cancelling a
    // desk later never changes an independently confirmed food reservation.
    await assertValidSourceDeskReservation({
      buildingId: input.buildingId,
      sourceDeskReservationId: input.sourceDeskReservationId,
      userId: input.userId,
      date,
      client: tx,
    });

    const existing = await tx.lunchReservation.findFirst({
      where: {
        userId: input.userId,
        date,
        status: LunchReservationStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (existing) {
      throw new LunchReservationError("برای این روز قبلا غذا رزرو کرده‌اید.");
    }

    const reservation = await tx.lunchReservation.create({
      data: {
        userId: input.userId,
        buildingId: input.buildingId,
        sourceReservationId: input.sourceReservationId,
        date,
        breakfastReserved,
        lunchReserved,
        status: LunchReservationStatus.ACTIVE,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "FoodReservation",
        entityId: reservation.id,
        action: "FOOD_RESERVATION_CREATED",
        newValue: {
          userId: reservation.userId,
          buildingId: reservation.buildingId,
          sourceReservationId: reservation.sourceReservationId,
          date: reservation.date.toISOString(),
          breakfastReserved: reservation.breakfastReserved,
          lunchReserved: reservation.lunchReserved,
          status: reservation.status,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: input.userId,
        lunchReservationId: reservation.id,
        type: "FOOD_RESERVED",
        title: "رزرو غذا ثبت شد",
        body: `رزرو غذای شما ${formatLunchReservationDate(reservation.date)} ثبت شد.`,
      },
    });

    return reservation;
  });
}

export async function updateLunchReservationLocation(input: {
  reservationId: string;
  userId: string;
  buildingId: string;
  breakfastReserved?: boolean;
  lunchReserved?: boolean;
  sourceReservationId?: string;
  sourceDeskReservationId?: string;
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
      throw new LunchReservationError("رزرو غذا پیدا نشد.");
    }

    const breakfastReserved =
      input.breakfastReserved ?? current.breakfastReserved;
    const lunchReserved = input.lunchReserved ?? current.lunchReserved;
    assertAtLeastOneMeal({ breakfastReserved, lunchReserved });
    assertAtMostOneSource(input);

    await assertLunchDateIsReservable({
      date: current.date,
      now: input.now,
      client: tx,
    });
    await assertActiveBuilding(input.buildingId, tx);
    await assertValidSourceReservation({
      buildingId: input.buildingId,
      sourceReservationId: input.sourceReservationId,
      userId: input.userId,
      date: startOfLocalDay(current.date),
      client: tx,
    });
    await assertValidSourceDeskReservation({
      buildingId: input.buildingId,
      sourceDeskReservationId: input.sourceDeskReservationId,
      userId: input.userId,
      date: startOfLocalDay(current.date),
      client: tx,
    });

    const updated = await tx.lunchReservation.update({
      where: { id: current.id },
      data: {
        buildingId: input.buildingId,
        breakfastReserved,
        lunchReserved,
        // A manually-created food reservation remains independent. A source is
        // only attached when this reservation was already created from a system booking.
        sourceReservationId: current.sourceReservationId
          ? current.sourceReservationId
          : undefined,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        entityType: "FoodReservation",
        entityId: updated.id,
        action: "FOOD_RESERVATION_UPDATED",
        oldValue: {
          buildingId: current.buildingId,
          breakfastReserved: current.breakfastReserved,
          lunchReserved: current.lunchReserved,
        },
        newValue: {
          buildingId: updated.buildingId,
          breakfastReserved: updated.breakfastReserved,
          lunchReserved: updated.lunchReserved,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: input.userId,
        lunchReservationId: updated.id,
        type: "FOOD_UPDATED",
        title: "رزرو غذا تغییر کرد",
        body: `وعده‌ها یا محل دریافت غذای شما ${formatLunchReservationDate(updated.date)} تغییر کرد.`,
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
      throw new LunchReservationError("رزرو غذا پیدا نشد.");
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
        entityType: "FoodReservation",
        entityId: cancelled.id,
        action: "FOOD_RESERVATION_CANCELLED_BY_USER",
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
        type: "FOOD_CANCELLED",
        title: "رزرو غذا لغو شد",
        body: `رزرو غذای شما ${formatLunchReservationDate(cancelled.date)} لغو شد.`,
      },
    });

    return cancelled;
  });
}

export async function cancelLunchReservationByManager(input: {
  reservationId: string;
  managerId: string;
  now?: Date;
}) {
  return db.$transaction(async (tx) => {
    await assertManagerOrAdmin(input.managerId, tx);

    const current = await tx.lunchReservation.findUnique({
      where: { id: input.reservationId },
    });

    if (!current || current.status !== LunchReservationStatus.ACTIVE) {
      throw new LunchReservationError("رزرو غذای فعال پیدا نشد.");
    }

    const cancelled = await tx.lunchReservation.update({
      where: { id: current.id },
      data: {
        status: LunchReservationStatus.CANCELLED_BY_ADMIN,
        cancelledAt: input.now ?? new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.managerId,
        entityType: "FoodReservation",
        entityId: cancelled.id,
        action: "FOOD_RESERVATION_CANCELLED_BY_MANAGER",
        oldValue: { status: current.status },
        newValue: {
          status: cancelled.status,
          cancelledAt: cancelled.cancelledAt?.toISOString() ?? null,
          userId: cancelled.userId,
        },
      },
    });

    await tx.notification.create({
      data: {
        userId: cancelled.userId,
        lunchReservationId: cancelled.id,
        type: "FOOD_CANCELLED",
        title: "رزرو غذا لغو شد",
        body: `رزرو غذای شما ${formatLunchReservationDate(cancelled.date)} توسط مدیر لغو شد.`,
      },
    });

    return cancelled;
  });
}

export async function cancelLinkedFoodReservationInTransaction(input: {
  sourceReservationId: string;
  actorUserId: string;
  client: DbClient;
  now?: Date;
}) {
  const current = await input.client.lunchReservation.findFirst({
    where: {
      sourceReservationId: input.sourceReservationId,
      status: LunchReservationStatus.ACTIVE,
    },
  });

  if (!current) {
    return null;
  }

  const cancelled = await input.client.lunchReservation.update({
    where: { id: current.id },
    data: {
      status: LunchReservationStatus.CANCELLED_BY_ADMIN,
      cancelledAt: input.now ?? new Date(),
    },
  });

  await input.client.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      entityType: "FoodReservation",
      entityId: cancelled.id,
      action: "FOOD_RESERVATION_CANCELLED_WITH_SYSTEM_RESERVATION",
      oldValue: { status: current.status },
      newValue: {
        status: cancelled.status,
        sourceReservationId: input.sourceReservationId,
        cancelledAt: cancelled.cancelledAt?.toISOString() ?? null,
      },
    },
  });

  await input.client.notification.create({
    data: {
      userId: cancelled.userId,
      lunchReservationId: cancelled.id,
      type: "FOOD_CANCELLED",
      title: "رزرو غذا لغو شد",
      body: `با لغو یا رد رزرو سیستم، رزرو غذای مرتبط ${formatLunchReservationDate(cancelled.date)} نیز لغو شد.`,
    },
  });

  return cancelled;
}
