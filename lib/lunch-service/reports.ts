import "server-only";

import { LunchReservationStatus } from "@prisma/client";

import { db } from "@/lib/db";

import { startOfLocalDay } from "./date-time";

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
