import "server-only";

import { UserRole, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export type DbClient = typeof db | Prisma.TransactionClient;

export const DEFAULT_MAX_ADVANCE_DAYS = 7;
export const DEFAULT_CUTOFF_TIME = "23:59";

export class LunchReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LunchReservationError";
  }
}

export async function assertAdmin(adminId: string, client: DbClient = db) {
  const user = await client.user.findUnique({
    where: { id: adminId },
    select: { active: true, role: true },
  });

  if (!user?.active || user.role !== UserRole.ADMIN) {
    throw new LunchReservationError("فقط مدیر سیستم می‌تواند تنظیمات ناهار را تغییر دهد.");
  }
}

export async function assertManagerOrAdmin(userId: string, client: DbClient = db) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true },
  });

  if (
    !user?.active ||
    (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN)
  ) {
    throw new LunchReservationError(
      "فقط مدیر یا مدیر سیستم می‌تواند رزرو ناهار دیگران را لغو کند.",
    );
  }
}

export async function assertActiveLocation(locationId: string, client: DbClient) {
  const location = await client.lunchLocation.findUnique({
    where: { id: locationId },
    select: { id: true, active: true },
  });

  if (!location?.active) {
    throw new LunchReservationError("ساختمان انتخاب‌شده فعال نیست.");
  }
}
