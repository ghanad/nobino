import assert from "node:assert/strict";
import test from "node:test";

import {
  SurveyAudienceMode,
  SurveyIdentityMode,
  SurveyKind,
  SurveyQuestionType,
} from "@prisma/client";

import {
  adminId,
  db,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";
import { createSurveyDraft, updateSurveyMetadata } from "@/lib/survey-service/metadata";
import { addQuestion, addOption } from "@/lib/survey-service/questions";
import { publishSurvey } from "@/lib/survey-service/lifecycle";
import { setAudienceMode, addAudienceUser } from "@/lib/survey-service/audience";
import { loadDraft, upsertDraft, deleteDraft } from "@/lib/survey-service/draft-response";
import { SurveyServiceError } from "@/lib/survey-service/shared";

registerBusinessRuleTestHooks();

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function createActiveSurveyWithQuestions() {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Survey with questions",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Survey with questions",
    startsAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  });

  // Text question
  const q1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "What is your name?",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  // Single choice question with options
  const q2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const optA = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q2.id,
    label: "Option A",
  });

  const optB = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q2.id,
    label: "Option B",
  });

  // Multiple choice question with options
  const q3 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick multiple",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
  });

  const optX = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q3.id,
    label: "Option X",
  });

  const optY = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q3.id,
    label: "Option Y",
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  return { survey, q1, q2, q3, optA, optB, optX, optY };
}

// ──────────────────────────────────────────────
// S20 Draft: Load
// ──────────────────────────────────────────────

test("S20 draft: load returns null when no draft exists", async () => {
  const { survey } = await createActiveSurveyWithQuestions();

  const draft = await loadDraft({ actorUserId: userId, surveyId: survey.id });
  assert.equal(draft, null);
});

test("S20 draft: load returns saved draft", async () => {
  const { survey, q1 } = await createActiveSurveyWithQuestions();

  const answers = { [q1.id]: "Hello" };
  await upsertDraft({ actorUserId: userId, surveyId: survey.id, answers });

  const loaded = await loadDraft({ actorUserId: userId, surveyId: survey.id });
  assert.deepEqual(loaded, answers);
});

test("S20 draft: load survives reload", async () => {
  const { survey, q1 } = await createActiveSurveyWithQuestions();

  const answers = { [q1.id]: "Persistent answer" };
  await upsertDraft({ actorUserId: userId, surveyId: survey.id, answers });

  // Load twice to verify persistence
  const loaded1 = await loadDraft({ actorUserId: userId, surveyId: survey.id });
  assert.deepEqual(loaded1, answers);

  const loaded2 = await loadDraft({ actorUserId: userId, surveyId: survey.id });
  assert.deepEqual(loaded2, answers);
});

test("S20 draft: cannot read another user's draft", async () => {
  const { survey, q1 } = await createActiveSurveyWithQuestions();

  await upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q1.id]: "User's draft" } });

  // Another user (secondUserId) should get null — they have no draft
  const draft = await loadDraft({ actorUserId: secondUserId, surveyId: survey.id });
  assert.equal(draft, null);
});

test("S20 draft: already-submitted recipient cannot load draft", async () => {
  const { survey } = await createActiveSurveyWithQuestions();

  // Mark as submitted
  await db.surveyRecipient.update({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
    data: { hasSubmitted: true },
  });

  await assert.rejects(
    () => loadDraft({ actorUserId: userId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S20 Draft: Upsert
// ──────────────────────────────────────────────

test("S20 draft: upsert saves and updates draft", async () => {
  const { survey, q1 } = await createActiveSurveyWithQuestions();

  await upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q1.id]: "First" } });
  let loaded = await loadDraft({ actorUserId: userId, surveyId: survey.id });
  assert.deepEqual(loaded, { [q1.id]: "First" });

  await upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q1.id]: "Updated" } });
  loaded = await loadDraft({ actorUserId: userId, surveyId: survey.id });
  assert.deepEqual(loaded, { [q1.id]: "Updated" });
});

test("S20 draft: upsert accepts incomplete answers", async () => {
  const { survey, q1 } = await createActiveSurveyWithQuestions();

  // Only answer one question out of three
  await upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q1.id]: "Partial" } });
  const loaded = await loadDraft({ actorUserId: userId, surveyId: survey.id });
  assert.equal(loaded?.[q1.id], "Partial");
});

test("S20 draft: upsert rejects unknown question ID", async () => {
  const { survey } = await createActiveSurveyWithQuestions();

  await assert.rejects(
    () => upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { "non-existent-id": "value" } }),
    SurveyServiceError,
  );
});

test("S20 draft: upsert rejects invalid option ID for single choice", async () => {
  const { survey, q2 } = await createActiveSurveyWithQuestions();

  await assert.rejects(
    () => upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q2.id]: "invalid-option" } }),
    SurveyServiceError,
  );
});

test("S20 draft: upsert rejects invalid option ID for multiple choice", async () => {
  const { survey, q3 } = await createActiveSurveyWithQuestions();

  await assert.rejects(
    () => upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q3.id]: ["invalid-option"] } }),
    SurveyServiceError,
  );
});

test("S20 draft: upsert rejects non-string value for single choice", async () => {
  const { survey, q2 } = await createActiveSurveyWithQuestions();

  await assert.rejects(
    () => upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q2.id]: 42 } }),
    SurveyServiceError,
  );
});

test("S20 draft: upsert rejects non-array value for multiple choice", async () => {
  const { survey, q3 } = await createActiveSurveyWithQuestions();

  await assert.rejects(
    () => upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q3.id]: "not-an-array" } }),
    SurveyServiceError,
  );
});

test("S20 draft: upsert rejects non-number value for rating", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Rating test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Rating test",
    startsAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  });

  const ratingQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Rate this",
    type: SurveyQuestionType.RATING,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    () => upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [ratingQ.id]: "not-a-number" } }),
    SurveyServiceError,
  );
});

test("S20 draft: upsert rejects answers from another survey", async () => {
  const r1 = await createActiveSurveyWithQuestions();
  const r2 = await createActiveSurveyWithQuestions();

  // Try to save an answer key that exists in r2's survey but with r1's survey ID
  await assert.rejects(
    () => upsertDraft({ actorUserId: adminId, surveyId: r1.survey.id, answers: { [r2.q2.id]: "value" } }),
    SurveyServiceError,
  );
});

test("S20 draft: already-submitted recipient cannot upsert", async () => {
  const { survey, q1 } = await createActiveSurveyWithQuestions();

  await db.surveyRecipient.update({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
    data: { hasSubmitted: true },
  });

  await assert.rejects(
    () => upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q1.id]: "Late answer" } }),
    SurveyServiceError,
  );
});

test("S20 draft: non-recipient cannot upsert", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Targeted survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Targeted survey",
    startsAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  });

  const q1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  // Set audience to only admin
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: adminId,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  // userId is not a recipient
  await assert.rejects(
    () => upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q1.id]: "Test" } }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S20 Draft: Delete
// ──────────────────────────────────────────────

test("S20 draft: delete removes draft", async () => {
  const { survey, q1 } = await createActiveSurveyWithQuestions();

  await upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q1.id]: "To delete" } });
  let loaded = await loadDraft({ actorUserId: userId, surveyId: survey.id });
  assert.notEqual(loaded, null);

  await deleteDraft({ actorUserId: userId, surveyId: survey.id });
  loaded = await loadDraft({ actorUserId: userId, surveyId: survey.id });
  assert.equal(loaded, null);
});

test("S20 draft: delete on non-existent draft does not error", async () => {
  const { survey } = await createActiveSurveyWithQuestions();

  // Deleting a non-existent draft should not throw
  await deleteDraft({ actorUserId: userId, surveyId: survey.id });
});

test("S20 draft: cannot delete another user's draft", async () => {
  const { survey, q1 } = await createActiveSurveyWithQuestions();

  await upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q1.id]: "User's draft" } });

  // secondUserId tries to delete userId's draft
  await deleteDraft({ actorUserId: secondUserId, surveyId: survey.id });
  // userId's draft should still exist
  const loaded = await loadDraft({ actorUserId: userId, surveyId: survey.id });
  assert.notEqual(loaded, null);
});

// ──────────────────────────────────────────────
// S20 Draft: Privacy and access
// ──────────────────────────────────────────────

test("S20 draft: draft content is not logged (no audit log created)", async () => {
  const { survey, q1 } = await createActiveSurveyWithQuestions();

  const auditBefore = await db.auditLog.count({
    where: { entityId: survey.id },
  });

  await upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q1.id]: "Hello" } });

  const auditAfter = await db.auditLog.count({
    where: { entityId: survey.id },
  });

  // No new audit logs for draft operations
  assert.equal(auditAfter, auditBefore);
});

test("S20 draft: rejects oversized payload", async () => {
  const { survey } = await createActiveSurveyWithQuestions();

  const largeAnswers: Record<string, string> = {};
  let size = 0;
  for (let i = 0; size < 60_000; i++) {
    const value = "x".repeat(100);
    largeAnswers[`key_${i}`] = value;
    size += value.length + `key_${i}`.length + 10;
  }

  await assert.rejects(
    () => upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: largeAnswers }),
    SurveyServiceError,
  );
});

test("S20 draft: draft is inaccessible after response window ends", async () => {
  const { survey, q1 } = await createActiveSurveyWithQuestions();

  // Create a draft
  await upsertDraft({ actorUserId: userId, surveyId: survey.id, answers: { [q1.id]: "Draft" } });

  // Move survey end to past
  await db.survey.update({
    where: { id: survey.id },
    data: {
      endsAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    },
  });

  // Loading should fail because survey is no longer active
  await assert.rejects(
    () => loadDraft({ actorUserId: userId, surveyId: survey.id }),
    SurveyServiceError,
  );
});
