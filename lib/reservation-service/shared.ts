import "server-only";

import { UserRole, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export type DbClient = typeof db | Prisma.TransactionClient;

export class ReservationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationTransitionError";
  }
}

export async function assertManagerOrAdmin(
  userId: string,
  client: DbClient = db,
) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { active: true, role: true },
  });

  if (
    !user?.active ||
    (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN)
  ) {
    throw new ReservationTransitionError(
      "Only managers or admins can perform this action.",
    );
  }
}
