import "server-only";

import { ReservationStatus, UserRole } from "@prisma/client";

import { db } from "@/lib/db";
import { endOfLocalDay, startOfLocalDay, validateDeskReservationTimeRange } from "@/lib/desk-schedule";
import { assertManagerOrAdmin, ReservationTransitionError, type DbClient } from "@/lib/reservation-service/shared";

const ACTIVE_STATUSES: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.APPROVED,
];
const ONE_HOUR_MS = 60 * 60 * 1000;

export function calculateDeskAutoApprovalAt(input: {
  autoApprovalDelayHours: number;
  autoApprovalEnabled: boolean;
  createdAt: Date;
  startAt: Date;
}): Date | null {
  if (!input.autoApprovalEnabled) return null;

  const deadline = new Date(
    input.createdAt.getTime() + input.autoApprovalDelayHours * ONE_HOUR_MS,
  );
  return deadline.getTime() < input.startAt.getTime() ? deadline : input.startAt;
}

async function assertWithinAdvanceWindow(startAt: Date, tx: DbClient) {
  const settings = await tx.deskSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", maxAdvanceDays: 14 },
    select: { maxAdvanceDays: true },
  });
  const lastAllowed = startOfLocalDay(new Date());
  lastAllowed.setDate(lastAllowed.getDate() + settings.maxAdvanceDays);
  if (startOfLocalDay(startAt).getTime() > lastAllowed.getTime()) {
    throw new ReservationTransitionError(
      `رزرو میز حداکثر تا ${settings.maxAdvanceDays} روز آینده امکان‌پذیر است.`,
    );
  }
}

async function assertDeskAvailable(
  input: { deskId: string; endAt: Date; excludeId?: string; startAt: Date },
  tx: DbClient,
) {
  const conflict = await tx.deskReservation.findFirst({
    where: {
      deskId: input.deskId,
      endAt: { gt: input.startAt },
      id: input.excludeId ? { not: input.excludeId } : undefined,
      startAt: { lt: input.endAt },
      status: ReservationStatus.APPROVED,
    },
    select: { id: true },
  });
  if (conflict) throw new ReservationTransitionError("این میز در بازه انتخاب‌شده رزرو شده است.");
}

async function assertOneReservationPerDay(
  input: { date: Date; excludeId?: string; userId: string },
  tx: DbClient,
) {
  const existing = await tx.deskReservation.findFirst({
    where: {
      id: input.excludeId ? { not: input.excludeId } : undefined,
      startAt: { gte: startOfLocalDay(input.date), lt: endOfLocalDay(input.date) },
      status: { in: ACTIVE_STATUSES },
      userId: input.userId,
    },
    select: { id: true },
  });
  if (existing) throw new ReservationTransitionError("هر کاربر در هر روز فقط می‌تواند یک میز رزرو کند.");
}

async function notifyManagersOfPendingReservation(
  reservationId: string,
  tx: DbClient,
) {
  const [reservation, managers] = await Promise.all([
    tx.deskReservation.findUnique({
      where: { id: reservationId },
      select: {
        desk: { select: { name: true, office: { select: { name: true } } } },
        user: { select: { name: true } },
      },
    }),
    tx.user.findMany({
      where: { active: true, role: { in: [UserRole.MANAGER, UserRole.ADMIN] } },
      select: { id: true },
    }),
  ]);
  if (!reservation || managers.length === 0) return;
  await tx.notification.createMany({
    data: managers.map((manager) => ({
      body: `درخواست رزرو ${reservation.desk.name} در ${reservation.desk.office.name} توسط ${reservation.user.name} در انتظار بررسی است.`,
      deskReservationId: reservationId,
      title: "درخواست رزرو میز",
      type: "NEW_PENDING_DESK_RESERVATION",
      userId: manager.id,
    })),
  });
}

export async function createDeskReservation(input: {
  deskId: string;
  endAt: Date;
  startAt: Date;
  userId: string;
}) {
  return db.$transaction(async (tx) => {
    await validateDeskReservationTimeRange(input, tx);
    await assertWithinAdvanceWindow(input.startAt, tx);
    await assertOneReservationPerDay({ date: input.startAt, userId: input.userId }, tx);
    await assertDeskAvailable(input, tx);

    const settings = await tx.deskSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default", maxAdvanceDays: 14 },
    });
    const createdAt = new Date();
    const autoApprovalAt = calculateDeskAutoApprovalAt({
      autoApprovalDelayHours: settings.autoApprovalDelayHours,
      autoApprovalEnabled: settings.autoApprovalEnabled,
      createdAt,
      startAt: input.startAt,
    });
    const pending = await tx.deskReservation.create({
      data: {
        autoApprovalAt,
        createdAt,
        deskId: input.deskId,
        endAt: input.endAt,
        startAt: input.startAt,
        status: ReservationStatus.PENDING,
        userId: input.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.userId,
        action: "DESK_RESERVATION_CREATED",
        entityId: pending.id,
        entityType: "DeskReservation",
        newValue: {
          deskId: pending.deskId,
          autoApprovalAt: pending.autoApprovalAt?.toISOString() ?? null,
          endAt: pending.endAt.toISOString(),
          startAt: pending.startAt.toISOString(),
          status: pending.status,
          userId: pending.userId,
        },
      },
    });

    await notifyManagersOfPendingReservation(pending.id, tx);
    return pending;
  });
}

export async function approveDeskReservation(input: {
  managerId: string;
  reservationId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertManagerOrAdmin(input.managerId, tx);
    return approveDeskReservationInTransaction(tx, {
      actorUserId: input.managerId,
      approvedAt: new Date(),
      auditAction: "DESK_RESERVATION_APPROVED",
      notificationBody: "درخواست رزرو میز شما توسط مدیر تأیید شد.",
      notificationTitle: "تأیید رزرو میز",
      notificationType: "DESK_RESERVATION_APPROVED",
      reservationId: input.reservationId,
    });
  });
}

export async function approveDeskReservationInTransaction(
  tx: DbClient,
  input: {
    actorUserId: string | null;
    approvedAt: Date;
    auditAction: string;
    notificationBody: string;
    notificationTitle: string;
    notificationType: string;
    reservationId: string;
  },
) {
    const reservation = await tx.deskReservation.findUnique({
      where: { id: input.reservationId },
      select: { deskId: true, endAt: true, id: true, startAt: true, status: true, userId: true },
    });
    if (!reservation) throw new ReservationTransitionError("رزرو میز پیدا نشد.");
    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ReservationTransitionError("فقط درخواست در انتظار بررسی قابل تأیید است.");
    }

    await validateDeskReservationTimeRange(reservation, tx);
    await assertOneReservationPerDay({ date: reservation.startAt, excludeId: reservation.id, userId: reservation.userId }, tx);
    await assertDeskAvailable({ ...reservation, excludeId: reservation.id }, tx);

    const approved = await tx.deskReservation.update({
      where: { id: reservation.id },
      data: {
        approvedAt: input.approvedAt,
        autoApprovalAt: null,
        status: ReservationStatus.APPROVED,
      },
    });
    await tx.auditLog.create({
      data: {
        action: input.auditAction,
        actorUserId: input.actorUserId,
        entityId: approved.id,
        entityType: "DeskReservation",
        newValue: { approvedAt: input.approvedAt.toISOString(), status: approved.status },
      },
    });
    await tx.notification.create({
      data: {
        body: input.notificationBody,
        deskReservationId: approved.id,
        title: input.notificationTitle,
        type: input.notificationType,
        userId: approved.userId,
      },
    });
    return approved;
}

export async function rejectDeskReservation(input: {
  managerId: string;
  reservationId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertManagerOrAdmin(input.managerId, tx);
    const reservation = await tx.deskReservation.findUnique({
      where: { id: input.reservationId }, select: { id: true, status: true, userId: true },
    });
    if (!reservation) throw new ReservationTransitionError("رزرو میز پیدا نشد.");
    if (reservation.status !== ReservationStatus.PENDING) {
      throw new ReservationTransitionError("فقط درخواست در انتظار بررسی قابل رد است.");
    }
    const rejected = await tx.deskReservation.update({
      where: { id: reservation.id },
      data: { autoApprovalAt: null, status: ReservationStatus.REJECTED },
    });
    await tx.auditLog.create({
      data: {
        action: "DESK_RESERVATION_REJECTED", actorUserId: input.managerId,
        entityId: rejected.id, entityType: "DeskReservation",
        newValue: { status: rejected.status },
      },
    });
    await tx.notification.create({
      data: {
        body: "درخواست رزرو میز شما توسط مدیر رد شد.", deskReservationId: rejected.id,
        title: "رد رزرو میز", type: "DESK_RESERVATION_REJECTED", userId: rejected.userId,
      },
    });
    return rejected;
  });
}

export async function updateDeskReservation(input: {
  actorUserId: string;
  deskId: string;
  endAt: Date;
  reservationId: string;
  startAt: Date;
}) {
  return db.$transaction(async (tx) => {
    const [actor, reservation] = await Promise.all([
      tx.user.findUnique({ where: { id: input.actorUserId }, select: { active: true, role: true } }),
      tx.deskReservation.findUnique({
        where: { id: input.reservationId },
        select: { deskId: true, endAt: true, id: true, startAt: true, status: true, userId: true },
      }),
    ]);
    if (!actor?.active || !reservation) throw new ReservationTransitionError("رزرو میز پیدا نشد.");
    const isManager = actor.role === "MANAGER" || actor.role === "ADMIN";
    if (!isManager && reservation.userId !== input.actorUserId) {
      throw new ReservationTransitionError("اجازه ویرایش این رزرو را ندارید.");
    }
    if (!ACTIVE_STATUSES.includes(reservation.status)) {
      throw new ReservationTransitionError("فقط رزرو فعال قابل ویرایش است.");
    }
    const now = new Date();
    if (reservation.endAt <= now) throw new ReservationTransitionError("رزرو پایان‌یافته قابل ویرایش نیست.");
    if (reservation.startAt <= now && (
      input.startAt.getTime() !== reservation.startAt.getTime() || input.deskId !== reservation.deskId
    )) {
      throw new ReservationTransitionError("پس از شروع رزرو فقط ساعت پایان قابل تغییر است.");
    }
    if (reservation.startAt <= now && input.endAt <= now) {
      throw new ReservationTransitionError("ساعت پایان جدید باید بعد از زمان فعلی باشد.");
    }

    await validateDeskReservationTimeRange({
      allowPastStart: reservation.startAt <= now,
      deskId: input.deskId,
      endAt: input.endAt,
      startAt: input.startAt,
    }, tx);
    await assertWithinAdvanceWindow(input.startAt, tx);
    await assertOneReservationPerDay({ date: input.startAt, excludeId: reservation.id, userId: reservation.userId }, tx);
    await assertDeskAvailable({ ...input, excludeId: reservation.id }, tx);

    const settings = reservation.status === ReservationStatus.PENDING
      ? await tx.deskSettings.upsert({
          where: { id: "default" },
          update: {},
          create: { id: "default", maxAdvanceDays: 14 },
        })
      : null;
    const autoApprovalAt = settings
      ? calculateDeskAutoApprovalAt({
          autoApprovalDelayHours: settings.autoApprovalDelayHours,
          autoApprovalEnabled: settings.autoApprovalEnabled,
          createdAt: new Date(),
          startAt: input.startAt,
        })
      : null;
    const updated = await tx.deskReservation.update({
      where: { id: reservation.id },
      data: {
        autoApprovalAt: reservation.status === ReservationStatus.PENDING
          ? autoApprovalAt
          : null,
        deskId: input.deskId,
        endAt: input.endAt,
        startAt: input.startAt,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: "DESK_RESERVATION_UPDATED",
        entityId: updated.id,
        entityType: "DeskReservation",
        oldValue: { deskId: reservation.deskId, endAt: reservation.endAt.toISOString(), startAt: reservation.startAt.toISOString() },
        newValue: { autoApprovalAt: updated.autoApprovalAt?.toISOString() ?? null, deskId: updated.deskId, endAt: updated.endAt.toISOString(), startAt: updated.startAt.toISOString() },
      },
    });
    if (isManager && input.actorUserId !== reservation.userId) {
      await tx.notification.create({
        data: {
          body: "زمان یا میز رزرو شما توسط مدیر تغییر کرد.",
          deskReservationId: updated.id,
          title: "تغییر رزرو میز",
          type: "DESK_RESERVATION_UPDATED_BY_MANAGER",
          userId: reservation.userId,
        },
      });
    }
    return updated;
  });
}

async function cancelDeskReservation(input: {
  actorUserId: string;
  manager: boolean;
  reservationId: string;
}) {
  return db.$transaction(async (tx) => {
    if (input.manager) await assertManagerOrAdmin(input.actorUserId, tx);
    const reservation = await tx.deskReservation.findUnique({
      where: { id: input.reservationId }, select: { id: true, status: true, userId: true },
    });
    if (!reservation) throw new ReservationTransitionError("رزرو میز پیدا نشد.");
    if (!input.manager && reservation.userId !== input.actorUserId) {
      throw new ReservationTransitionError("اجازه لغو این رزرو را ندارید.");
    }
    if (!ACTIVE_STATUSES.includes(reservation.status)) {
      throw new ReservationTransitionError("این رزرو قبلاً پایان یافته یا لغو شده است.");
    }
    const cancelledAt = new Date();
    const updated = await tx.deskReservation.update({
      where: { id: reservation.id },
      data: {
        autoApprovalAt: null,
        cancelledAt,
        cancelledById: input.actorUserId,
        status: input.manager ? ReservationStatus.CANCELLED_BY_ADMIN : ReservationStatus.CANCELLED_BY_USER,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.manager ? "DESK_RESERVATION_CANCELLED_BY_MANAGER" : "DESK_RESERVATION_CANCELLED_BY_USER",
        entityId: updated.id,
        entityType: "DeskReservation",
        newValue: { cancelledAt: cancelledAt.toISOString(), status: updated.status },
      },
    });
    if (input.manager && input.actorUserId !== reservation.userId) {
      await tx.notification.create({
        data: {
          body: "رزرو میز شما توسط مدیر لغو شد.",
          deskReservationId: updated.id,
          title: "لغو رزرو میز",
          type: "DESK_RESERVATION_CANCELLED_BY_MANAGER",
          userId: reservation.userId,
        },
      });
    }
    return updated;
  });
}

export function cancelDeskReservationByUser(input: { reservationId: string; userId: string }) {
  return cancelDeskReservation({ actorUserId: input.userId, manager: false, reservationId: input.reservationId });
}

export function cancelDeskReservationByManager(input: { managerId: string; reservationId: string }) {
  return cancelDeskReservation({ actorUserId: input.managerId, manager: true, reservationId: input.reservationId });
}
