import assert from "node:assert/strict";
import test from "node:test";

import { SurveyAudienceMode, SurveyIdentityMode, SurveyKind, SurveyState } from "@prisma/client";

import {
  adminId,
  db,
  managerId,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";
import { createSurveyDraft } from "@/lib/survey-service/metadata";
import { SurveyServiceError } from "@/lib/survey-service/shared";

registerBusinessRuleTestHooks();

test("audience: set audience mode to targeted", async () => {
  const { setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Audience mode test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  assert.equal(survey.audienceMode, SurveyAudienceMode.ALL_ACTIVE);

  const result = await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });

  assert.equal(result.audienceMode, SurveyAudienceMode.TARGETED);

  const reloaded = await db.survey.findUnique({
    where: { id: survey.id },
    select: { audienceMode: true },
  });
  assert.equal(reloaded?.audienceMode, SurveyAudienceMode.TARGETED);

  const logs = await db.auditLog.findMany({
    where: {
      entityType: "Survey",
      entityId: survey.id,
      action: "SURVEY_AUDIENCE_MODE_CHANGED",
    },
  });
  assert.equal(logs.length, 1);
});

test("audience: only owner/admin can set audience mode", async () => {
  const { setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Audience mode auth",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    setAudienceMode({
      actorUserId: userId,
      surveyId: survey.id,
      audienceMode: SurveyAudienceMode.TARGETED,
    }),
    SurveyServiceError,
  );

  await db.user.update({
    where: { id: userId },
    data: { canCreateSurveys: true },
  });

  const survey2 = await createSurveyDraft({
    actorUserId: userId,
    title: "Owner test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await setAudienceMode({
    actorUserId: userId,
    surveyId: survey2.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });

  assert.equal(
    (await db.survey.findUnique({ where: { id: survey2.id }, select: { audienceMode: true } }))
      ?.audienceMode,
    SurveyAudienceMode.TARGETED,
  );
});

test("audience: collaborator cannot change audience mode", async () => {
  const { setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Collab audience",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await db.surveyCollaborator.create({
    data: { surveyId: survey.id, userId: userId },
  });

  await assert.rejects(
    setAudienceMode({
      actorUserId: userId,
      surveyId: survey.id,
      audienceMode: SurveyAudienceMode.TARGETED,
    }),
    SurveyServiceError,
  );
});

test("audience: cannot change audience mode on published survey", async () => {
  const { setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Published mode",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await db.survey.update({
    where: { id: survey.id },
    data: { state: SurveyState.PUBLISHED },
  });

  await assert.rejects(
    setAudienceMode({
      actorUserId: adminId,
      surveyId: survey.id,
      audienceMode: SurveyAudienceMode.TARGETED,
    }),
    SurveyServiceError,
  );
});

test("audience: add and remove team", async () => {
  const { addAudienceTeam, removeAudienceTeam } = await import(
    "@/lib/survey-service/audience"
  );

  const team = await db.team.create({ data: { name: "Audience Test Team" } });
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Team audience",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: survey.id },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: team.id,
  });

  const selections = await db.surveyAudienceTeam.findMany({
    where: { surveyId: survey.id },
  });
  assert.equal(selections.length, 1);
  assert.equal(selections[0].teamId, team.id);

  await removeAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: team.id,
  });

  assert.equal(
    await db.surveyAudienceTeam.count({ where: { surveyId: survey.id } }),
    0,
  );
});

test("audience: duplicate team rejected", async () => {
  const { addAudienceTeam } = await import(
    "@/lib/survey-service/audience"
  );

  const team = await db.team.create({ data: { name: "Duplicate Team" } });
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Duplicate team",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: survey.id },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: team.id,
  });

  await assert.rejects(
    addAudienceTeam({
      actorUserId: adminId,
      surveyId: survey.id,
      teamId: team.id,
    }),
    SurveyServiceError,
  );
});

test("audience: non-existent team or none-added team removal rejected", async () => {
  const { addAudienceTeam, removeAudienceTeam } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Missing team",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: survey.id },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await assert.rejects(
    addAudienceTeam({
      actorUserId: adminId,
      surveyId: survey.id,
      teamId: "nonexistent-team",
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    removeAudienceTeam({
      actorUserId: adminId,
      surveyId: survey.id,
      teamId: "nonexistent-team",
    }),
    SurveyServiceError,
  );

  const team = await db.team.create({ data: { name: "Not Added Team" } });

  await assert.rejects(
    removeAudienceTeam({
      actorUserId: adminId,
      surveyId: survey.id,
      teamId: team.id,
    }),
    SurveyServiceError,
  );
});

test("audience: add and remove explicit user", async () => {
  const { addAudienceUser, removeAudienceUser } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "User audience",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: survey.id },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  const selections = await db.surveyAudienceUser.findMany({
    where: { surveyId: survey.id },
  });
  assert.equal(selections.length, 1);
  assert.equal(selections[0].userId, secondUserId);

  await removeAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  assert.equal(
    await db.surveyAudienceUser.count({ where: { surveyId: survey.id } }),
    0,
  );
});

test("audience: duplicate and inactive user rejected", async () => {
  const { addAudienceUser } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Duplicate user",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: survey.id },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  await assert.rejects(
    addAudienceUser({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );

  await db.user.update({
    where: { id: secondUserId },
    data: { active: false },
  });

  await assert.rejects(
    addAudienceUser({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );
});

test("audience: cross-survey ID rejected", async () => {
  const { addAudienceTeam, removeAudienceTeam, addAudienceUser, removeAudienceUser } =
    await import("@/lib/survey-service/audience");

  const team = await db.team.create({ data: { name: "Cross Survey Team" } });
  const survey1 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Cross survey 1",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const survey2 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Cross survey 2",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.updateMany({
    where: { id: { in: [survey1.id, survey2.id] } },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey1.id,
    teamId: team.id,
  });

  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey1.id,
    targetUserId: secondUserId,
  });

  await assert.rejects(
    removeAudienceTeam({
      actorUserId: adminId,
      surveyId: survey2.id,
      teamId: team.id,
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    removeAudienceUser({
      actorUserId: adminId,
      surveyId: survey2.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );

  assert.equal(
    await db.surveyAudienceTeam.count({ where: { surveyId: survey1.id } }),
    1,
  );
  assert.equal(
    await db.surveyAudienceUser.count({ where: { surveyId: survey1.id } }),
    1,
  );
});

test("audience: targeted selections require targeted mode", async () => {
  const { addAudienceTeam, addAudienceUser } = await import(
    "@/lib/survey-service/audience"
  );

  const team = await db.team.create({ data: { name: "Wrong Mode Team" } });
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Wrong audience mode",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addAudienceTeam({
      actorUserId: adminId,
      surveyId: survey.id,
      teamId: team.id,
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    addAudienceUser({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );

  assert.equal(
    await db.surveyAudienceTeam.count({ where: { surveyId: survey.id } }),
    0,
  );
  assert.equal(
    await db.surveyAudienceUser.count({ where: { surveyId: survey.id } }),
    0,
  );
});

test("audience: targeted preview deduplicates and excludes inactive or deleted users", async () => {
  const { addAudienceTeam, addAudienceUser, previewAudience, setAudienceMode } =
    await import("@/lib/survey-service/audience");

  const firstTeam = await db.team.create({ data: { name: "Preview Team A" } });
  const secondTeam = await db.team.create({ data: { name: "Preview Team B" } });
  await db.teamMembership.createMany({
    data: [
      { teamId: firstTeam.id, userId },
      { teamId: firstTeam.id, userId: secondUserId },
      { teamId: secondTeam.id, userId: secondUserId },
      { teamId: secondTeam.id, userId: managerId },
    ],
  });

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Targeted preview",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: firstTeam.id,
  });
  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: secondTeam.id,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: managerId,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: adminId,
  });

  await db.user.update({
    where: { id: secondUserId },
    data: { active: false },
  });
  await db.user.update({
    where: { id: managerId },
    data: { deletedAt: new Date() },
  });

  const preview = await previewAudience({
    actorUserId: adminId,
    surveyId: survey.id,
  });

  assert.deepEqual(
    new Set(preview.users.map((previewUser) => previewUser.id)),
    new Set([adminId, userId]),
  );
  assert.equal(preview.totalUniqueUsers, 2);
  assert.deepEqual(
    preview.teamSources.map((source) => [
      source.teamName,
      source.activeMemberCount,
    ]),
    [
      ["Preview Team A", 1],
      ["Preview Team B", 0],
    ],
  );
  assert.equal(preview.explicitUserCount, 1);
  assert.equal(preview.hasEffectiveAudience, true);
  assert.equal(
    await db.surveyRecipient.count({ where: { surveyId: survey.id } }),
    0,
  );
});

test("audience: preview represents an empty targeted audience clearly", async () => {
  const { previewAudience, setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Empty targeted preview",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });

  const preview = await previewAudience({
    actorUserId: adminId,
    surveyId: survey.id,
  });

  assert.deepEqual(preview.users, []);
  assert.equal(preview.totalUniqueUsers, 0);
  assert.deepEqual(preview.teamSources, []);
  assert.equal(preview.explicitUserCount, 0);
  assert.equal(preview.hasEffectiveAudience, false);
});

test("audience: all-active preview returns only active non-deleted users", async () => {
  const { previewAudience } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "All active preview",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.user.update({
    where: { id: userId },
    data: { active: false },
  });
  await db.user.update({
    where: { id: secondUserId },
    data: { deletedAt: new Date() },
  });

  const preview = await previewAudience({
    actorUserId: adminId,
    surveyId: survey.id,
  });

  assert.deepEqual(
    new Set(preview.users.map((previewUser) => previewUser.id)),
    new Set([adminId, managerId]),
  );
  assert.equal(preview.totalUniqueUsers, 2);
  assert.equal(preview.hasEffectiveAudience, true);
});

test("audience: audit payloads use only IDs and counts", async () => {
  const {
    addAudienceTeam,
    addAudienceUser,
    removeAudienceTeam,
    removeAudienceUser,
    setAudienceMode,
  } = await import("@/lib/survey-service/audience");

  const team = await db.team.create({ data: { name: "Audit Audience Team" } });
  await db.teamMembership.create({
    data: { teamId: team.id, userId: secondUserId },
  });
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Audience audit payload",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: team.id,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });
  await removeAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });
  await removeAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: team.id,
  });

  const logs = await db.auditLog.findMany({
    where: {
      entityType: "Survey",
      entityId: survey.id,
      action: { startsWith: "SURVEY_AUDIENCE_" },
    },
    orderBy: { createdAt: "asc" },
  });
  const serializedPayloads = JSON.stringify(
    logs.map((log) => ({ oldValue: log.oldValue, newValue: log.newValue })),
  );

  assert.equal(serializedPayloads.includes("Audit Audience Team"), false);
  assert.equal(serializedPayloads.includes("second@example.test"), false);
  assert.equal(serializedPayloads.includes("Second User"), false);
  assert.equal(serializedPayloads.includes(team.id), true);
  assert.equal(serializedPayloads.includes(secondUserId), true);
  assert.equal(serializedPayloads.includes("activeMemberCount"), true);
});

test("audience: collaborators cannot change targeted selections", async () => {
  const { addAudienceTeam, addAudienceUser, setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const team = await db.team.create({ data: { name: "Collaborator Audience Team" } });
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Collaborator targeted access",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await db.surveyCollaborator.create({
    data: { surveyId: survey.id, userId },
  });

  await assert.rejects(
    addAudienceTeam({
      actorUserId: userId,
      surveyId: survey.id,
      teamId: team.id,
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    addAudienceUser({
      actorUserId: userId,
      surveyId: survey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S08 — Question and option service
// ──────────────────────────────────────────────

