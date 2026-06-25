import "server-only";

import { ReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";

import { AdminSettingsError, assertAdmin } from "./shared";

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

  if (autoAcceptDelayHours < 1 || autoAcceptDelayHours > 24) {
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
