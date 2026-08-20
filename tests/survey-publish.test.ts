import assert from "node:assert/strict";
import test from "node:test";

import { Prisma, SurveyAudienceMode, SurveyConditionOperator, SurveyIdentityMode, SurveyKind, SurveyQuestionType, SurveyState, UserRole } from "@prisma/client";

import {
  adminId,
  db,
  managerId,
  passwordHash,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";
import { createSurveyDraft, updateSurveyMetadata } from "@/lib/survey-service/metadata";
import { SurveyServiceError } from "@/lib/survey-service/shared";

registerBusinessRuleTestHooks();

test("publishSurvey: owner can publish a valid draft with ALL_ACTIVE audience", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Publish test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    title: "Publish test",
    actorUserId: adminId,
    surveyId: survey.id,
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "How was your experience?",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  const updated = await db.survey.findUnique({
    where: { id: survey.id },
    select: {
      state: true,
      publishedAt: true,
      _count: { select: { recipients: true } },
    },
  });

  assert.equal(updated?.state, SurveyState.PUBLISHED);
  assert.ok(updated?.publishedAt !== null);
  assert.ok((updated?._count.recipients ?? 0) > 0);
  assert.equal(
    await db.notification.count({
      where: { surveyId: survey.id, type: "SURVEY_INVITATION" },
    }),
    updated?._count.recipients,
  );

  const publicationAudit = await db.auditLog.findFirstOrThrow({
    where: { action: "SURVEY_PUBLISHED", entityId: survey.id },
  });
  assert.equal(
    (publicationAudit.newValue as { invitationCount?: number }).invitationCount,
    updated?._count.recipients,
  );
});

test("publishSurvey: 50 frozen recipients receive exactly one Jalali invitation each", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");
  const additionalUsers = Array.from({ length: 46 }, (_, index) => ({
    id: `survey-recipient-${index}`,
    email: `survey-recipient-${index}@example.test`,
    name: `Survey Recipient ${index}`,
    passwordHash,
    role: UserRole.USER,
  }));
  await db.user.createMany({ data: additionalUsers });

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "دعوت شهریور",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "دعوت شهریور",
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
  });
  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  const invitations = await db.notification.findMany({
    where: { surveyId: survey.id, type: "SURVEY_INVITATION" },
    select: { body: true, userId: true },
  });
  assert.equal(invitations.length, 50);
  assert.equal(new Set(invitations.map((invitation) => invitation.userId)).size, 50);
  assert.match(invitations[0]?.body ?? "", /شروع:.*پایان:/);
  assert.match(invitations[0]?.body ?? "", /[۰-۹]/);
});

test("publishSurvey: admin can publish a valid draft with TARGETED audience", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");
  const { setAudienceMode, addAudienceTeam, addAudienceUser } = await import(
    "@/lib/survey-service/audience"
  );

  const team = await db.team.create({ data: { name: "Publish Team" } });
  await db.teamMembership.create({
    data: { teamId: team.id, userId: secondUserId },
  });

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Targeted publish",
    kind: SurveyKind.DATA_COLLECTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Targeted publish",
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
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
    targetUserId: userId,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Rate us",
    type: SurveyQuestionType.RATING,
    ratingMin: 1,
    ratingMax: 5,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await db.teamMembership.create({
    data: { teamId: team.id, userId: managerId },
  });

  const updated = await db.survey.findUnique({
    where: { id: survey.id },
    select: {
      state: true,
      publishedAt: true,
      recipients: {
        select: { userId: true },
        orderBy: { userId: "asc" },
      },
    },
  });
  assert.equal(updated?.state, SurveyState.PUBLISHED);
  assert.ok(updated?.publishedAt !== null);
  assert.deepEqual(
    updated?.recipients.map((recipient) => recipient.userId),
    [secondUserId, userId].sort(),
  );
});

test("publishSurvey: rejects non-owner without admin role", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "Not mine",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
    },
  });

  await assert.rejects(
    publishSurvey({ actorUserId: secondUserId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: rejects draft without start/end dates", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "No dates",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: rejects draft without questions", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "No questions",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "No questions",
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: rejects anonymous survey with fewer than 5 recipients", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Anon too few",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.ANONYMOUS,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Anon too few",
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: rejects already-published survey", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "Already published",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.PUBLISHED,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
      startsAt: new Date("2026-01-01T06:00:00Z"),
      endsAt: new Date("2026-01-01T14:00:00Z"),
    },
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: cross-survey ID is rejected", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "Other survey",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: secondUserId,
    },
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: end time must be after start time", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "Bad times",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
      startsAt: new Date("2026-09-01T14:00:00Z"),
      endsAt: new Date("2026-09-01T06:00:00Z"),
    },
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: revalidates stored metadata before publishing", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "   ",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
      startsAt: new Date("2026-09-01T06:00:00Z"),
      endsAt: new Date("2026-09-01T14:00:00Z"),
      questions: {
        create: {
          prompt: "Q1",
          type: SurveyQuestionType.SHORT_TEXT,
        },
      },
    },
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );

  const unchanged = await db.survey.findUnique({
    where: { id: survey.id },
    select: { state: true, recipients: true },
  });
  assert.equal(unchanged?.state, SurveyState.DRAFT);
  assert.equal(unchanged?.recipients.length, 0);
});

test("publishSurvey: rejects invalid stored branching conditions atomically", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const otherSurvey = await db.survey.create({
    data: {
      title: "Other condition source",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
    },
  });
  const sourceQuestion = await db.surveyQuestion.create({
    data: {
      surveyId: otherSurvey.id,
      prompt: "Other source",
      type: SurveyQuestionType.SINGLE_CHOICE,
      sortOrder: 0,
    },
  });
  const sourceOption = await db.surveyOption.create({
    data: {
      questionId: sourceQuestion.id,
      label: "Yes",
      sortOrder: 0,
    },
  });

  const survey = await db.survey.create({
    data: {
      title: "Invalid condition",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
      startsAt: new Date("2026-09-01T06:00:00Z"),
      endsAt: new Date("2026-09-01T14:00:00Z"),
    },
  });
  const targetQuestion = await db.surveyQuestion.create({
    data: {
      surveyId: survey.id,
      prompt: "Target",
      type: SurveyQuestionType.SHORT_TEXT,
      sortOrder: 1,
    },
  });
  await db.surveyQuestionCondition.create({
    data: {
      targetQuestionId: targetQuestion.id,
      sourceQuestionId: sourceQuestion.id,
      sourceOptionId: sourceOption.id,
      operator: SurveyConditionOperator.IS_SELECTED,
    },
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );

  const unchanged = await db.survey.findUnique({
    where: { id: survey.id },
    select: { state: true, recipients: true },
  });
  assert.equal(unchanged?.state, SurveyState.DRAFT);
  assert.equal(unchanged?.recipients.length, 0);
  assert.equal(
    await db.auditLog.count({
      where: {
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_PUBLISHED",
      },
    }),
    0,
  );
});

test("publishSurvey: concurrent double publish does not duplicate recipients", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Concurrent",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Concurrent",
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  const results = await Promise.allSettled([
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
  ]);

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );

  const recipients = await db.surveyRecipient.findMany({
    where: { surveyId: survey.id },
  });
  const userIds = recipients.map((r) => r.userId);
  assert.equal(userIds.length, new Set(userIds).size);
  assert.equal(
    await db.notification.count({
      where: { surveyId: survey.id, type: "SURVEY_INVITATION" },
    }),
    recipients.length,
  );
  assert.equal(
    await db.auditLog.count({
      where: {
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_PUBLISHED",
      },
    }),
    1,
  );
});

// ──────────────────────────────────────────────
// Lifecycle: extend end time
// ──────────────────────────────────────────────
