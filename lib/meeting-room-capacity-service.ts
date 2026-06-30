import "server-only";

import { ReservationStatus, type Prisma } from "@prisma/client";

import { CapacityUnavailableError } from "@/lib/capacity-service";
import { db } from "@/lib/db";

const ONE_HOUR_MS = 60 * 60 * 1000;

type DbClient = typeof db | Prisma.TransactionClient;

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

export async function getMeetingRoomSlotUsage(
  input: {
    roomId: string;
    startAt: Date;
    endAt: Date;
  },
  client: DbClient = db,
): Promise<
  Array<{
    approvedCount: number;
    capacity: number;
    pendingCount: number;
    slotEnd: Date;
    slotStart: Date;
  }>
> {
  const reservations = await client.meetingRoomReservation.findMany({
    where: {
      roomId: input.roomId,
      startAt: { lt: input.endAt },
      endAt: { gt: input.startAt },
      status: {
        in: [ReservationStatus.APPROVED, ReservationStatus.PENDING],
      },
    },
    select: {
      endAt: true,
      startAt: true,
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
      capacity: 1,
      pendingCount: overlappingReservations.filter(
        (reservation) => reservation.status === ReservationStatus.PENDING,
      ).length,
    };
  });
}

export async function assertMeetingRoomCapacityAvailableForApproval(
  input: {
    roomId: string;
    startAt: Date;
    endAt: Date;
    excludeReservationId?: string;
  },
  client: DbClient = db,
): Promise<void> {
  const slots = buildHourlySlots(input.startAt, input.endAt);
  const approvedReservations = await client.meetingRoomReservation.findMany({
    where: {
      roomId: input.roomId,
      startAt: { lt: input.endAt },
      endAt: { gt: input.startAt },
      status: ReservationStatus.APPROVED,
      id: input.excludeReservationId
        ? { not: input.excludeReservationId }
        : undefined,
    },
    select: {
      endAt: true,
      startAt: true,
    },
  });

  const hasFullSlot = slots.some((slot) =>
    approvedReservations.some(
      (reservation) =>
        reservation.startAt < slot.slotEnd && reservation.endAt > slot.slotStart,
    ),
  );

  if (hasFullSlot) {
    throw new CapacityUnavailableError(
      "Meeting room is already approved for this time range.",
    );
  }
}
