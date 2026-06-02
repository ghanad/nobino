import "server-only";

import {
  AnnouncementAudience,
  AnnouncementSeverity,
  UserRole,
  type Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";

type DbClient = typeof db | Prisma.TransactionClient;

export class AnnouncementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnouncementError";
  }
}

export type PendingAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  requiresAck: boolean;
};

async function assertAdmin(adminId: string, client: DbClient = db) {
  const user = await client.user.findUnique({
    where: { id: adminId },
    select: { active: true, role: true },
  });

  if (!user?.active || user.role !== UserRole.ADMIN) {
    throw new AnnouncementError("Only admins can manage announcements.");
  }
}

function getAudienceForRole(role: UserRole): AnnouncementAudience[] {
  if (role === UserRole.ADMIN) {
    return [AnnouncementAudience.ALL, AnnouncementAudience.ADMIN];
  }

  if (role === UserRole.MANAGER) {
    return [AnnouncementAudience.ALL, AnnouncementAudience.MANAGER];
  }

  return [AnnouncementAudience.ALL, AnnouncementAudience.USER];
}

function assertAnnouncementWindow(input: {
  startsAt: Date;
  endsAt?: Date | null;
}) {
  if (input.endsAt && input.endsAt <= input.startsAt) {
    throw new AnnouncementError("Announcement end date must be after start date.");
  }
}

export async function createAnnouncement(input: {
  adminId: string;
  audience: AnnouncementAudience;
  body: string;
  endsAt?: Date | null;
  requiresAck: boolean;
  severity: AnnouncementSeverity;
  startsAt: Date;
  title: string;
}) {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title || !body) {
    throw new AnnouncementError("Announcement title and body are required.");
  }

  assertAnnouncementWindow(input);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const announcement = await tx.announcement.create({
      data: {
        audience: input.audience,
        body,
        createdById: input.adminId,
        endsAt: input.endsAt ?? null,
        requiresAck: input.requiresAck,
        severity: input.severity,
        startsAt: input.startsAt,
        title,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "Announcement",
        entityId: announcement.id,
        action: "ANNOUNCEMENT_CREATED",
        newValue: {
          audience: announcement.audience,
          endsAt: announcement.endsAt?.toISOString() ?? null,
          requiresAck: announcement.requiresAck,
          severity: announcement.severity,
          startsAt: announcement.startsAt.toISOString(),
          title: announcement.title,
        },
      },
    });

    return announcement;
  });
}

export async function deactivateAnnouncement(input: {
  adminId: string;
  announcementId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.announcement.findUnique({
      where: { id: input.announcementId },
      select: { active: true, id: true, title: true },
    });

    if (!current) {
      throw new AnnouncementError("Announcement was not found.");
    }

    if (!current.active) {
      return current;
    }

    const updated = await tx.announcement.update({
      where: { id: current.id },
      data: { active: false },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "Announcement",
        entityId: updated.id,
        action: "ANNOUNCEMENT_DEACTIVATED",
        oldValue: { active: true, title: current.title },
        newValue: { active: false, title: updated.title },
      },
    });

    return updated;
  });
}

export async function getPendingAnnouncementForUser(input: {
  role: UserRole;
  userId: string;
}): Promise<PendingAnnouncement | null> {
  const now = new Date();
  const announcements = await db.announcement.findMany({
    where: {
      active: true,
      audience: { in: getAudienceForRole(input.role) },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: [{ createdAt: "asc" }],
    take: 20,
    select: {
      id: true,
      title: true,
      body: true,
      severity: true,
      requiresAck: true,
      receipts: {
        where: { userId: input.userId },
        select: { acknowledgedAt: true, seenAt: true },
        take: 1,
      },
    },
  });

  const pending = announcements
    .sort((left, right) => {
      if (left.severity !== right.severity) {
        return left.severity === AnnouncementSeverity.IMPORTANT ? -1 : 1;
      }

      if (left.requiresAck !== right.requiresAck) {
        return left.requiresAck ? -1 : 1;
      }

      return left.id.localeCompare(right.id);
    })
    .find((announcement) => {
      const receipt = announcement.receipts[0];

      if (announcement.requiresAck) {
        return !receipt?.acknowledgedAt;
      }

      return !receipt?.seenAt;
    });

  if (!pending) {
    return null;
  }

  return {
    id: pending.id,
    title: pending.title,
    body: pending.body,
    severity: pending.severity,
    requiresAck: pending.requiresAck,
  };
}

export async function recordAnnouncementReceipt(input: {
  announcementId: string;
  acknowledge: boolean;
  userId: string;
}) {
  const announcement = await db.announcement.findUnique({
    where: { id: input.announcementId },
    select: { id: true, requiresAck: true },
  });

  if (!announcement) {
    throw new AnnouncementError("Announcement was not found.");
  }

  const now = new Date();

  return db.announcementReceipt.upsert({
    where: {
      announcementId_userId: {
        announcementId: announcement.id,
        userId: input.userId,
      },
    },
    create: {
      announcementId: announcement.id,
      acknowledgedAt: input.acknowledge ? now : null,
      seenAt: now,
      userId: input.userId,
    },
    update: {
      acknowledgedAt: input.acknowledge ? now : undefined,
      seenAt: now,
    },
  });
}
