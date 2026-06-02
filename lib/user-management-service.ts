import "server-only";

import { UserRole, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";

type DbClient = typeof db | Prisma.TransactionClient;

export class UserManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserManagementError";
  }
}

async function assertAdmin(adminId: string, client: DbClient = db) {
  const user = await client.user.findUnique({
    where: { id: adminId },
    select: { active: true, role: true },
  });

  if (!user?.active || user.role !== UserRole.ADMIN) {
    throw new UserManagementError("Only admins can manage users.");
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(name: string): string {
  return name.trim();
}

function assertPassword(password: string): void {
  if (password.length < 8) {
    throw new UserManagementError("Password must be at least 8 characters.");
  }
}

export async function createManagedUser(input: {
  adminId: string;
  name: string;
  email: string;
  role: UserRole;
  password: string;
}) {
  const name = normalizeName(input.name);
  const email = normalizeEmail(input.email);

  if (!name) {
    throw new UserManagementError("User name is required.");
  }

  assertPassword(input.password);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      throw new UserManagementError("A user with this email already exists.");
    }

    const user = await tx.user.create({
      data: {
        name,
        email,
        role: input.role,
        passwordHash: await hashPassword(input.password),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "User",
        entityId: user.id,
        action: "USER_CREATED",
        newValue: user,
      },
    });

    return user;
  });
}

export async function updateManagedUser(input: {
  adminId: string;
  userId: string;
  name: string;
  role: UserRole;
  active: boolean;
  canViewLunchReport: boolean;
}) {
  const name = normalizeName(input.name);

  if (!name) {
    throw new UserManagementError("User name is required.");
  }

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        canViewLunchReport: true,
      },
    });

    if (!current) {
      throw new UserManagementError("User was not found.");
    }

    if (current.id === input.adminId && !input.active) {
      throw new UserManagementError("Admins cannot deactivate their own account.");
    }

    const updated = await tx.user.update({
      where: { id: current.id },
      data: {
        name,
        role: input.role,
        active: input.active,
        canViewLunchReport: input.canViewLunchReport,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        canViewLunchReport: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "User",
        entityId: updated.id,
        action:
          current.role !== updated.role ? "USER_ROLE_CHANGED" : "USER_UPDATED",
        oldValue: current,
        newValue: updated,
      },
    });

    return updated;
  });
}

export async function deleteManagedUser(input: {
  adminId: string;
  userId: string;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        deletedAt: true,
      },
    });

    if (!current || current.deletedAt) {
      throw new UserManagementError("User was not found.");
    }

    if (current.id === input.adminId) {
      throw new UserManagementError("Admins cannot delete their own account.");
    }

    const deleted = await tx.user.update({
      where: { id: current.id },
      data: {
        active: false,
        deletedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        deletedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "User",
        entityId: deleted.id,
        action: "USER_DELETED",
        oldValue: current,
        newValue: deleted,
      },
    });

    return deleted;
  });
}

export async function resetManagedUserPassword(input: {
  adminId: string;
  userId: string;
  password: string;
}) {
  assertPassword(input.password);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);

    const current = await tx.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
      },
    });

    if (!current) {
      throw new UserManagementError("User was not found.");
    }

    await tx.user.update({
      where: { id: current.id },
      data: {
        passwordHash: await hashPassword(input.password),
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "User",
        entityId: current.id,
        action: "USER_PASSWORD_RESET",
        newValue: {
          email: current.email,
          passwordReset: true,
        },
      },
    });
  });
}
