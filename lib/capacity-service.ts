import "server-only";

import { ReservationStatus, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";

const ONE_HOUR_MS = 60 * 60 * 1000;

type DbClient = typeof db | Prisma.TransactionClient;

export class CapacityUnavailableError extends Error {
  constructor(message = "Approved capacity is full for this time range.") {
    super(message);
    this.name = "CapacityUnavailableError";
  }
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

export async function getSlotUsage(
  input: {
    resourcePoolId: string;
    startAt: Date;
    endAt: Date;
  },
  client: DbClient = db,
): Promise<
  Array<{
    slotStart: Date;
    slotEnd: Date;
    approvedCount: number;
    pendingCount: number;
    capacity: number;
  }>
> {
  const resourcePool = await client.resourcePool.findUnique({
    where: { id: input.resourcePoolId },
    select: { capacity: true, active: true },
  });

  if (!resourcePool?.active) {
    throw new CapacityUnavailableError("Resource pool is not available.");
  }

  const reservations = await client.reservation.findMany({
    where: {
      resourcePoolId: input.resourcePoolId,
      startAt: { lt: input.endAt },
      endAt: { gt: input.startAt },
      status: {
        in: [ReservationStatus.APPROVED, ReservationStatus.PENDING],
      },
    },
    select: {
      startAt: true,
      endAt: true,
      status: true,
    },
  });

  return buildHourlySlots(input.startAt, input.endAt).map((slot) => {
    const overlappingReservations = reservations.filter(
      (reservation) =>
        reservation.startAt < slot.slotEnd && reservation.endAt > slot.slotStart,
    );

    return {
      ...slot,
      approvedCount: overlappingReservations.filter(
        (reservation) => reservation.status === ReservationStatus.APPROVED,
      ).length,
      pendingCount: overlappingReservations.filter(
        (reservation) => reservation.status === ReservationStatus.PENDING,
      ).length,
      capacity: resourcePool.capacity,
    };
  });
}

export async function assertCapacityAvailableForApproval(
  input: {
    resourcePoolId: string;
    startAt: Date;
    endAt: Date;
    excludeReservationId?: string;
  },
  client: DbClient = db,
): Promise<void> {
  const resourcePool = await client.resourcePool.findUnique({
    where: { id: input.resourcePoolId },
    select: { capacity: true, active: true },
  });

  if (!resourcePool?.active) {
    throw new CapacityUnavailableError("Resource pool is not available.");
  }

  const slots = buildHourlySlots(input.startAt, input.endAt);
  const approvedReservations = await client.reservation.findMany({
    where: {
      resourcePoolId: input.resourcePoolId,
      startAt: { lt: input.endAt },
      endAt: { gt: input.startAt },
      status: ReservationStatus.APPROVED,
      id: input.excludeReservationId
        ? { not: input.excludeReservationId }
        : undefined,
    },
    select: {
      startAt: true,
      endAt: true,
    },
  });

  const hasFullSlot = slots.some((slot) => {
    const approvedCount = approvedReservations.filter(
      (reservation) =>
        reservation.startAt < slot.slotEnd && reservation.endAt > slot.slotStart,
    ).length;

    return approvedCount >= resourcePool.capacity;
  });

  if (hasFullSlot) {
    throw new CapacityUnavailableError();
  }
}
