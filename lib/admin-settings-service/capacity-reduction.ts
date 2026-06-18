import { ReservationStatus, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import { buildHourlySlots, startOfLocalDay } from "./date-time";

type DbClient = typeof db | Prisma.TransactionClient;

export type BlockingSlot = {
  slotStart: Date;
  count: number;
};

export async function findCapacityReductionBlocks(input: {
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

  const usageBySlot = new Map<string, BlockingSlot>();
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

  const blocks: BlockingSlot[] = [];

  for (const slot of usageBySlot.values()) {
    const proposedCapacity =
      capacityByDate.get(startOfLocalDay(slot.slotStart).toISOString()) ??
      input.capacity;

    if (slot.count > proposedCapacity) {
      blocks.push(slot);
    }
  }

  return blocks.sort(
    (left, right) => left.slotStart.getTime() - right.slotStart.getTime(),
  );
}

export async function findDailyCapacityReductionBlocks(input: {
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

  const usageBySlot = new Map<string, BlockingSlot>();

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
