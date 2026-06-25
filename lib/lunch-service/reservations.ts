import "server-only";

import { LunchReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";

import { startOfLocalDay } from "./date-time";
import { assertLunchDateIsReservable } from "./service-days";
import {
  assertActiveLocation,
  assertManagerOrAdmin,
  LunchReservationError,
} from "./shared";

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
      throw new LunchReservationError("رزرو ناهار فعال پیدا نشد.");
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
        entityType: "LunchReservation",
        entityId: cancelled.id,
        action: "LUNCH_RESERVATION_CANCELLED_BY_MANAGER",
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
        type: "LUNCH_CANCELLED",
        title: "رزرو ناهار لغو شد",
        body: "رزرو ناهار شما توسط مدیر لغو شد.",
      },
    });

    return cancelled;
  });
}
