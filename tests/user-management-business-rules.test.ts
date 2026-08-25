import assert from "node:assert/strict";
import { test } from "node:test";

import { ReservationStatus, UserRole } from "@prisma/client";

import {
  deleteManagedUser,
  findOrProvisionLdapUser,
  updateManagedUser,
  UserManagementError,
} from "@/lib/user-management-service";

import {
  addHours,
  adminId,
  createReservation,
  db,
  nextWorkingDateAtHour,
  registerBusinessRuleTestHooks,
  secondUserId,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

test("ldap-authenticated users are provisioned with the default user role", async () => {
  const user = await findOrProvisionLdapUser({
    email: "new-user@example.test",
    name: "New LDAP User",
  });

  const [storedUser, auditLog] = await Promise.all([
    db.user.findUnique({
      where: { email: "new-user@example.test" },
      select: {
        active: true,
        canViewLunchReport: true,
        canCreateSurveys: true,
        name: true,
        passwordHash: true,
        role: true,
      },
    }),
    db.auditLog.findFirst({
      where: {
        entityId: user?.id,
        action: "USER_CREATED",
      },
    }),
  ]);

  assert.equal(user?.active, true);
  assert.equal(user?.role, UserRole.USER);
  assert.equal(storedUser?.active, true);
  assert.equal(storedUser?.canViewLunchReport, false);
  assert.equal(storedUser?.canCreateSurveys, false);
  assert.equal(storedUser?.name, "New LDAP User");
  assert.equal(storedUser?.passwordHash, "ldap-provisioned");
  assert.equal(storedUser?.role, UserRole.USER);
  assert.equal(auditLog?.actorUserId, null);
});

test("ldap provisioning preserves disabled user access control", async () => {
  await db.user.update({
    where: { id: secondUserId },
    data: {
      active: false,
      deletedAt: new Date(),
    },
  });

  const user = await findOrProvisionLdapUser({
    email: "second@example.test",
    name: "Second User",
  });

  const storedUser = await db.user.findUnique({
    where: { id: secondUserId },
    select: { active: true, deletedAt: true },
  });

  assert.equal(user, null);
  assert.equal(storedUser?.active, false);
  assert.ok(storedUser?.deletedAt);
});

test("admin can delete a managed user without removing reservation history", async () => {
  const startAt = nextWorkingDateAtHour(9);
  const endAt = addHours(startAt, 1);
  const reservation = await createReservation({
    userId: secondUserId,
    startAt,
    endAt,
    status: ReservationStatus.APPROVED,
  });

  await deleteManagedUser({ adminId, userId: secondUserId });

  const [deletedUser, existingReservation, auditLog] = await Promise.all([
    db.user.findUnique({
      where: { id: secondUserId },
      select: { active: true, deletedAt: true },
    }),
    db.reservation.findUnique({
      where: { id: reservation.id },
      select: { userId: true },
    }),
    db.auditLog.findFirst({
      where: {
        entityId: secondUserId,
        action: "USER_DELETED",
      },
    }),
  ]);

  assert.equal(deletedUser?.active, false);
  assert.ok(deletedUser?.deletedAt);
  assert.equal(existingReservation?.userId, secondUserId);
  assert.ok(auditLog);
});

test("admin cannot delete their own account", async () => {
  await assert.rejects(
    () => deleteManagedUser({ adminId, userId: adminId }),
    UserManagementError,
  );

  const admin = await db.user.findUnique({
    where: { id: adminId },
    select: { active: true, deletedAt: true },
  });

  assert.equal(admin?.active, true);
  assert.equal(admin?.deletedAt, null);
});

test("admin can toggle survey creation permission and audit the old and new values", async () => {
  const updated = await updateManagedUser({
    adminId,
    userId: secondUserId,
    name: "Second User",
    role: UserRole.USER,
    active: true,
    canViewLunchReport: false,
    canCreateSurveys: true,
  });

  const enabledAudit = await db.auditLog.findFirstOrThrow({
    where: { entityId: secondUserId, action: "USER_UPDATED" },
    orderBy: { createdAt: "desc" },
  });

  assert.equal(updated.canCreateSurveys, true);
  assert.equal((enabledAudit.oldValue as { canCreateSurveys: boolean }).canCreateSurveys, false);
  assert.equal((enabledAudit.newValue as { canCreateSurveys: boolean }).canCreateSurveys, true);

  await updateManagedUser({
    adminId,
    userId: secondUserId,
    name: "Second User",
    role: UserRole.USER,
    active: true,
    canViewLunchReport: false,
    canCreateSurveys: false,
  });

  const storedUser = await db.user.findUniqueOrThrow({
    where: { id: secondUserId },
    select: { canCreateSurveys: true },
  });
  assert.equal(storedUser.canCreateSurveys, false);
});
