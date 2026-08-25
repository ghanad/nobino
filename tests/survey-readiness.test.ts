import assert from "node:assert/strict";
import test from "node:test";

import { SurveyAudienceMode, SurveyIdentityMode, SurveyKind, SurveyQuestionType, SurveyState } from "@prisma/client";

import {
  adminId,
  db,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";
import { createSurveyDraft, updateSurveyMetadata } from "@/lib/survey-service/metadata";
import { SurveyServiceError } from "@/lib/survey-service/shared";

registerBusinessRuleTestHooks();

test("checkPublishReadiness: returns ready for a complete draft", async () => {
  const { checkPublishReadiness } = await import(
    "@/lib/survey-service/publish-readiness"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Ready check",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Ready check",
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "How was it?",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  const report = await checkPublishReadiness(survey.id);

  assert.equal(report.ready, true);
  assert.ok(report.recipientCount > 0);
  assert.equal(report.questionCount, 1);
  assert.equal(report.hasAnonymousThreshold, false);
  assert.equal(report.isVoteKind, false);
});

test("checkPublishReadiness: reports missing questions", async () => {
  const { checkPublishReadiness } = await import(
    "@/lib/survey-service/publish-readiness"
  );

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

  const report = await checkPublishReadiness(survey.id);

  assert.equal(report.ready, false);
  assert.ok(report.issues.some((i) => i.category === "questions" && i.severity === "error"));
});

test("checkPublishReadiness: reports missing schedule", async () => {
  const { checkPublishReadiness } = await import(
    "@/lib/survey-service/publish-readiness"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "No schedule",
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

  const report = await checkPublishReadiness(survey.id);

  assert.equal(report.ready, false);
  assert.ok(report.issues.some((i) => i.category === "schedule" && i.severity === "error"));
});

test("checkPublishReadiness: reports missing audience", async () => {
  const { checkPublishReadiness } = await import(
    "@/lib/survey-service/publish-readiness"
  );

  // Create a survey with TARGETED audience but no teams/users
  const survey = await db.survey.create({
    data: {
      title: "No audience",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.TARGETED,
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

  const report = await checkPublishReadiness(survey.id);

  assert.equal(report.ready, false);
  assert.ok(report.issues.some((i) => i.category === "audience" && i.severity === "error"));
});

test("checkPublishReadiness: reports anonymous threshold error for < 5 recipients", async () => {
  const { checkPublishReadiness } = await import(
    "@/lib/survey-service/publish-readiness"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Anonymous few",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.ANONYMOUS,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Anonymous few",
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

  const report = await checkPublishReadiness(survey.id);

  assert.equal(report.ready, false);
  assert.ok(report.issues.some((i) => i.category === "privacy" && i.severity === "error"));
  assert.equal(report.hasAnonymousThreshold, false);
});

test("checkPublishReadiness: anonymous threshold warning for >= 5 recipients", async () => {
  const { checkPublishReadiness } = await import(
    "@/lib/survey-service/publish-readiness"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Anonymous enough",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.ANONYMOUS,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Anonymous enough",
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

  // Create 4 additional active users to reach 5 total
  const extraUserIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const u = await db.user.create({
      data: {
        name: `Extra User ${i}`,
        email: `extra${i}@test.com`,
        passwordHash: "test-hash",
        active: true,
        canCreateSurveys: false,
      },
    });
    extraUserIds.push(u.id);
  }

  const report = await checkPublishReadiness(survey.id);

  // ALL_ACTIVE should now include admin + 4 extra = 5 recipients
  assert.equal(report.ready, true);
  assert.equal(report.hasAnonymousThreshold, true);
  assert.ok(report.issues.some((i) => i.category === "privacy" && i.severity === "warning"));
});

test("checkPublishReadiness: reports vote embargo warning for vote kind", async () => {
  const { checkPublishReadiness } = await import(
    "@/lib/survey-service/publish-readiness"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Vote check",
    kind: SurveyKind.VOTE,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Vote check",
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

  const report = await checkPublishReadiness(survey.id);

  assert.equal(report.ready, true);
  assert.equal(report.isVoteKind, true);
  assert.ok(report.issues.some((i) => i.category === "privacy" && i.severity === "warning"));
});

test("checkPublishReadiness: returns ready: false for non-existent survey", async () => {
  const { checkPublishReadiness } = await import(
    "@/lib/survey-service/publish-readiness"
  );

  const report = await checkPublishReadiness("nonexistent-id");

  assert.equal(report.ready, false);
  assert.equal(report.recipientCount, 0);
  assert.equal(report.questionCount, 0);
});
