import assert from "node:assert/strict";
import test from "node:test";

import { SurveyIdentityMode, SurveyKind, SurveyState, UserRole } from "@prisma/client";

import {
  adminId,
  db,
  managerId,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";
import { createSurveyDraft } from "@/lib/survey-service/metadata";
import {
  canEditSurveyDraft,
  canParticipate,
  canViewSurveyResults,
} from "@/lib/survey-permissions";
import type { SurveyActor } from "@/lib/survey-permissions";
import { SurveyServiceError } from "@/lib/survey-service/shared";

registerBusinessRuleTestHooks();

function makeActor(input: {
  role?: UserRole;
  active?: boolean;
  canCreateSurveys?: boolean;
  isOwner?: boolean;
  isCollaborator?: boolean;
  isRecipient?: boolean;
} = {}): SurveyActor {
  return {
    user: {
      role: input.role ?? UserRole.USER,
      active: input.active ?? true,
      canCreateSurveys: input.canCreateSurveys ?? false,
    },
    isOwner: input.isOwner ?? false,
    isCollaborator: input.isCollaborator ?? false,
    isRecipient: input.isRecipient ?? false,
  };
}

test("participation requires an active recipient and an active survey", () => {
  const recipient = makeActor({ isRecipient: true });
  const inactiveRecipient = makeActor({ isRecipient: true, active: false });
  const adminRecipient = makeActor({ role: UserRole.ADMIN, isRecipient: true });
  const adminNonRecipient = makeActor({ role: UserRole.ADMIN });
  const collaboratorNonRecipient = makeActor({ isCollaborator: true });
  const ownerNonRecipient = makeActor({ isOwner: true, canCreateSurveys: true });

  assert.equal(canParticipate(recipient, "ACTIVE"), true);
  assert.equal(canParticipate(adminRecipient, "ACTIVE"), true);
  assert.equal(canParticipate(inactiveRecipient, "ACTIVE"), false);
  assert.equal(canParticipate(recipient, "SCHEDULED"), false);
  assert.equal(canParticipate(recipient, "ENDED"), false);
  assert.equal(canParticipate(recipient, "DRAFT"), false);
  assert.equal(canParticipate(recipient, "ARCHIVED"), false);
  assert.equal(canParticipate(adminNonRecipient, "ACTIVE"), false);
  assert.equal(canParticipate(collaboratorNonRecipient, "ACTIVE"), false);
  assert.equal(canParticipate(ownerNonRecipient, "ACTIVE"), false);
});

// ── S06: Collaborator service ──

test("collaboratorCRUD: add, reject owner/duplicate/inactive, remove, cross-survey", async (t) => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Collab test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  // Owner cannot be added as collaborator.
  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: adminId }),
    SurveyServiceError,
  );

  // Add a valid collaborator.
  await addCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  // Duplicate is rejected.
  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: secondUserId }),
    SurveyServiceError,
  );

  // Verify collaborator exists.
  const collab = await db.surveyCollaborator.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId: secondUserId } },
  });
  assert.ok(collab);

  // Collaborator passes permission checks.
  const actor = await (await import("@/lib/survey-service/shared")).resolveSurveyActor(db, {
    actorUserId: secondUserId,
    surveyId: survey.id,
    ownerId: survey.ownerId,
    user: await (await import("@/lib/survey-service/shared")).loadActiveActorUser(secondUserId, db),
  });
  assert.equal(actor.isCollaborator, true);
  assert.equal(canEditSurveyDraft(actor, SurveyState.DRAFT), true);
  assert.equal(canViewSurveyResults(actor), true);

  // Remove collaborator.
  await removeCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  // Verify collaborator is removed.
  assert.equal(
    await db.surveyCollaborator.findUnique({
      where: { surveyId_userId: { surveyId: survey.id, userId: secondUserId } },
    }),
    null,
  );

  // Removed collaborator immediately loses access.
  const actorAfter = await (await import("@/lib/survey-service/shared")).resolveSurveyActor(db, {
    actorUserId: secondUserId,
    surveyId: survey.id,
    ownerId: survey.ownerId,
    user: await (await import("@/lib/survey-service/shared")).loadActiveActorUser(secondUserId, db),
  });
  assert.equal(actorAfter.isCollaborator, false);
  assert.equal(canEditSurveyDraft(actorAfter, SurveyState.DRAFT), false);
  assert.equal(canViewSurveyResults(actorAfter), false);

  // Remove non-collaborator is rejected.
  await assert.rejects(
    removeCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: userId }),
    SurveyServiceError,
  );
});

test("collaborator auth: non-admin/owner cannot manage collaborators", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Auth test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  // Regular user cannot add.
  await assert.rejects(
    addCollaborator({ actorUserId: userId, surveyId: survey.id, targetUserId: secondUserId }),
    SurveyServiceError,
  );

  // Add as admin, then collaborator cannot remove others.
  await addCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  // Collaborator cannot remove themselves or anyone else.
  await assert.rejects(
    removeCollaborator({ actorUserId: secondUserId, surveyId: survey.id, targetUserId: secondUserId }),
    SurveyServiceError,
  );
  await assert.rejects(
    removeCollaborator({ actorUserId: secondUserId, surveyId: survey.id, targetUserId: userId }),
    SurveyServiceError,
  );

  // Manager who is not owner cannot manage.
  await assert.rejects(
    addCollaborator({ actorUserId: managerId, surveyId: survey.id, targetUserId: userId }),
    SurveyServiceError,
  );
});

test("a soft-deleted actor cannot manage collaborators", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Deleted actor",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await addCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });
  await db.user.update({
    where: { id: adminId },
    data: { active: true, deletedAt: new Date() },
  });

  await assert.rejects(
    addCollaborator({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: userId,
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    removeCollaborator({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );
});

test("collaborators are audited with target user identity", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Audit test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await addCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  await removeCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  const logs = await db.auditLog.findMany({
    where: {
      entityType: "Survey",
      entityId: survey.id,
      action: { in: ["SURVEY_COLLABORATOR_ADDED", "SURVEY_COLLABORATOR_REMOVED"] },
    },
    orderBy: { createdAt: "asc" },
  });

  assert.equal(logs.length, 2);
  assert.deepEqual(
    logs.map((l) => l.action),
    ["SURVEY_COLLABORATOR_ADDED", "SURVEY_COLLABORATOR_REMOVED"],
  );

  const addedLog = logs[0];
  const addedValue = addedLog.newValue as Record<string, unknown>;
  assert.equal(addedValue.targetUserId, secondUserId);
  assert.equal(addedValue.targetUserName, "Second User");
  assert.equal(addedValue.targetUserEmail, "second@example.test");

  const removedLog = logs[1];
  const removedValue = removedLog.oldValue as Record<string, unknown>;
  assert.equal(removedValue.targetUserId, secondUserId);
  assert.equal(removedValue.targetUserName, "Second User");
  assert.equal(removedValue.targetUserEmail, "second@example.test");
});

test("a collaborator relation cannot be removed through another survey ID", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const firstSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "First survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const secondSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Second survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await addCollaborator({
    actorUserId: adminId,
    surveyId: firstSurvey.id,
    targetUserId: secondUserId,
  });

  await assert.rejects(
    removeCollaborator({
      actorUserId: adminId,
      surveyId: secondSurvey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );
  assert.ok(
    await db.surveyCollaborator.findUnique({
      where: {
        surveyId_userId: {
          surveyId: firstSurvey.id,
          userId: secondUserId,
        },
      },
    }),
  );
});

test("collaborator changes work on published surveys", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Published collab",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await db.survey.update({
    where: { id: survey.id },
    data: { state: SurveyState.PUBLISHED },
  });

  await addCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  const collab = await db.surveyCollaborator.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId: secondUserId } },
  });
  assert.ok(collab);

  await removeCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  assert.equal(
    await db.surveyCollaborator.findUnique({
      where: { surveyId_userId: { surveyId: survey.id, userId: secondUserId } },
    }),
    null,
  );
});

test("collaborator: inactive/deleted user cannot be added", async () => {
  const { addCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Inactive test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  // Deactivate second user.
  await db.user.update({
    where: { id: secondUserId },
    data: { active: false },
  });

  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: secondUserId }),
    SurveyServiceError,
  );

  // Re-activate and soft-delete.
  await db.user.update({
    where: { id: secondUserId },
    data: { active: true, deletedAt: new Date() },
  });

  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: secondUserId }),
    SurveyServiceError,
  );
});

test("collaborator: non-existent survey or target user is rejected", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: "nonexistent", targetUserId: secondUserId }),
    SurveyServiceError,
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Missing user",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: "fake-user" }),
    SurveyServiceError,
  );

  await assert.rejects(
    removeCollaborator({ actorUserId: adminId, surveyId: "nonexistent", targetUserId: secondUserId }),
    SurveyServiceError,
  );
});

