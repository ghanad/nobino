import "server-only";

import { UserRole, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";

type DbClient = typeof db | Prisma.TransactionClient;

export class TeamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamError";
  }
}

async function assertAdmin(adminId: string, client: DbClient = db) {
  const user = await client.user.findUnique({
    where: { id: adminId },
    select: { active: true, role: true },
  });

  if (!user?.active || user.role !== UserRole.ADMIN) {
    throw new TeamError("Only admins can manage teams.");
  }
}

function normalizeName(name: string): string {
  return name.trim();
}

export async function createTeam(input: {
  adminId: string;
  name: string;
}) {
  const name = normalizeName(input.name);

  if (!name) {
    throw new TeamError("Team name is required.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const existing = await tx.team.findUnique({
      where: { name },
      select: { id: true },
    });

    if (existing) {
      throw new TeamError("A team with this name already exists.");
    }

    const team = await tx.team.create({
      data: { name },
      select: { id: true, name: true, createdAt: true },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "Team",
        entityId: team.id,
        action: "TEAM_CREATED",
        newValue: { name: team.name },
      },
    });

    return team;
  });
}

export async function updateTeam(input: {
  adminId: string;
  teamId: string;
  name: string;
}) {
  const name = normalizeName(input.name);

  if (!name) {
    throw new TeamError("Team name is required.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.team.findUnique({
      where: { id: input.teamId },
      select: { id: true, name: true },
    });

    if (!current) {
      throw new TeamError("Team was not found.");
    }

    if (current.name === name) {
      return { id: current.id, name: current.name };
    }

    const nameTaken = await tx.team.findUnique({
      where: { name },
      select: { id: true },
    });

    if (nameTaken) {
      throw new TeamError("A team with this name already exists.");
    }

    const updated = await tx.team.update({
      where: { id: current.id },
      data: { name },
      select: { id: true, name: true },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "Team",
        entityId: updated.id,
        action: "TEAM_RENAMED",
        oldValue: { name: current.name },
        newValue: { name: updated.name },
      },
    });

    return updated;
  });
}

export async function deleteTeam(input: {
  adminId: string;
  teamId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.team.findUnique({
      where: { id: input.teamId },
      select: { id: true, name: true },
    });

    if (!current) {
      throw new TeamError("Team was not found.");
    }

    // TeamMembership rows are removed by the cascade relation.
    await tx.team.delete({ where: { id: current.id } });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "Team",
        entityId: current.id,
        action: "TEAM_DELETED",
        oldValue: { name: current.name },
      },
    });
  });
}

export async function addTeamMember(input: {
  adminId: string;
  teamId: string;
  userId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const team = await tx.team.findUnique({
      where: { id: input.teamId },
      select: { id: true, name: true },
    });

    if (!team) {
      throw new TeamError("Team was not found.");
    }

    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, email: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      throw new TeamError("User was not found.");
    }

    const existing = await tx.teamMembership.findUnique({
      where: {
        teamId_userId: {
          teamId: team.id,
          userId: user.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new TeamError("This user is already a member of the team.");
    }

    await tx.teamMembership.create({
      data: { teamId: team.id, userId: user.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "TeamMembership",
        entityId: team.id,
        action: "TEAM_MEMBER_ADDED",
        newValue: {
          teamName: team.name,
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
        },
      },
    });
  });
}

export async function removeTeamMember(input: {
  adminId: string;
  teamId: string;
  userId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const team = await tx.team.findUnique({
      where: { id: input.teamId },
      select: { id: true, name: true },
    });

    if (!team) {
      throw new TeamError("Team was not found.");
    }

    const membership = await tx.teamMembership.findUnique({
      where: {
        teamId_userId: {
          teamId: team.id,
          userId: input.userId,
        },
      },
      select: { id: true, user: { select: { name: true, email: true } } },
    });

    if (!membership) {
      throw new TeamError("This user is not a member of the team.");
    }

    await tx.teamMembership.delete({ where: { id: membership.id } });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "TeamMembership",
        entityId: team.id,
        action: "TEAM_MEMBER_REMOVED",
        oldValue: {
          teamName: team.name,
          userId: input.userId,
          userEmail: membership.user.email,
          userName: membership.user.name,
        },
      },
    });
  });
}
