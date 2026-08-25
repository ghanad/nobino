import assert from "node:assert/strict";
import test from "node:test";

import { SurveyAudienceMode, SurveyConditionOperator, SurveyIdentityMode, SurveyKind, SurveyQuestionType, SurveyState } from "@prisma/client";

import {
  adminId,
  db,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";
import { createSurveyDraft } from "@/lib/survey-service/metadata";
import { SurveyServiceError } from "@/lib/survey-service/shared";

registerBusinessRuleTestHooks();

test("questions: add and return questions of each type", async () => {
  const { addQuestion, addOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Question types",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const textQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Short text",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  assert.equal(textQ.type, SurveyQuestionType.SHORT_TEXT);
  assert.equal(textQ.prompt, "Short text");
  assert.equal(textQ.sortOrder, 0);

  const longTextQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Long text",
    type: SurveyQuestionType.LONG_TEXT,
  });
  assert.equal(longTextQ.sortOrder, 1);

  const choiceQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Single choice",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  assert.equal(choiceQ.sortOrder, 2);

  const multiQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Multiple choice",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
    maxSelections: 3,
  });
  assert.equal(multiQ.maxSelections, 3);
  assert.equal(multiQ.sortOrder, 3);

  const ratingQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Rating",
    type: SurveyQuestionType.RATING,
    ratingMin: 0,
    ratingMax: 10,
    ratingMinLabel: "Bad",
    ratingMaxLabel: "Good",
  });
  assert.equal(ratingQ.ratingMin, 0);
  assert.equal(ratingQ.ratingMax, 10);
  assert.equal(ratingQ.ratingMinLabel, "Bad");
  assert.equal(ratingQ.ratingMaxLabel, "Good");
  assert.equal(ratingQ.sortOrder, 4);

  // Verify audit logs
  const logs = await db.auditLog.findMany({
    where: { entityId: survey.id, action: "SURVEY_QUESTION_ADDED" },
  });
  assert.equal(logs.length, 5);
});

test("questions: adding to a non-draft survey is rejected", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await db.survey.create({
    data: {
      title: "Published survey",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.PUBLISHED,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2026-02-01"),
    },
  });

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Should fail",
      type: SurveyQuestionType.SHORT_TEXT,
    }),
    SurveyServiceError,
  );
});

test("questions: empty prompt is rejected", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Empty prompt",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "   ",
      type: SurveyQuestionType.SHORT_TEXT,
    }),
    SurveyServiceError,
  );
});

test("questions: rating bounds are validated", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Rating bounds",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Bad rating",
      type: SurveyQuestionType.RATING,
      ratingMin: -1,
      ratingMax: 5,
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Bad rating",
      type: SurveyQuestionType.RATING,
      ratingMin: 1,
      ratingMax: 11,
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Bad rating",
      type: SurveyQuestionType.RATING,
      ratingMin: 5,
      ratingMax: 3,
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Bad rating",
      type: SurveyQuestionType.RATING,
      ratingMin: 1.5,
      ratingMax: 5,
    }),
    SurveyServiceError,
  );
});

test("questions: maxSelections is validated per type", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Max selections",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  // Valid for MULTIPLE_CHOICE
  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Multi",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
    maxSelections: 2,
  });
  assert.equal(q.maxSelections, 2);

  // Invalid for SINGLE_CHOICE
  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Single",
      type: SurveyQuestionType.SINGLE_CHOICE,
      maxSelections: 2,
    }),
    SurveyServiceError,
  );

  // Invalid for SHORT_TEXT
  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Text",
      type: SurveyQuestionType.SHORT_TEXT,
      maxSelections: 2,
    }),
    SurveyServiceError,
  );

  // Non-positive integer is rejected
  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Multi bad",
      type: SurveyQuestionType.MULTIPLE_CHOICE,
      maxSelections: 0,
    }),
    SurveyServiceError,
  );
});

test("questions: randomizeOptions is rejected for non-choice types", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Randomize",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Text",
      type: SurveyQuestionType.SHORT_TEXT,
      randomizeOptions: true,
    }),
    SurveyServiceError,
  );
});

test("questions: update question properties", async () => {
  const { addQuestion, updateQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Update question",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Original",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  const updated = await updateQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    prompt: "Updated",
    helpText: "Helpful text",
    required: true,
  });

  assert.equal(updated.prompt, "Updated");
  assert.equal(updated.helpText, "Helpful text");
  assert.equal(updated.required, true);
});

test("questions: update validates merged state", async () => {
  const { addQuestion, updateQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Update validates",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Rating",
    type: SurveyQuestionType.RATING,
    ratingMin: 1,
    ratingMax: 5,
  });

  // Setting ratingMin > ratingMax should fail
  await assert.rejects(
    updateQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      ratingMin: 5,
      ratingMax: 3,
    }),
    SurveyServiceError,
  );
});

test("questions: delete removes question and normalizes sort order", async () => {
  const { addQuestion, deleteQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Delete question",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const q2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q2",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const q3 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q3",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await deleteQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q2.id,
  });

  const remaining = await db.surveyQuestion.findMany({
    where: { surveyId: survey.id },
    orderBy: { sortOrder: "asc" },
  });

  assert.equal(remaining.length, 2);
  assert.equal(remaining[0].id, q1.id);
  assert.equal(remaining[0].sortOrder, 0);
  assert.equal(remaining[1].id, q3.id);
  assert.equal(remaining[1].sortOrder, 1);
});

test("questions: delete handles dependent conditions", async () => {
  const { addQuestion, addOption, deleteQuestion, deleteOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Delete with conditions",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const sourceQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const targetQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQ.id,
    label: "Yes",
  });

  await db.surveyQuestionCondition.create({
    data: {
      targetQuestionId: targetQ.id,
      sourceQuestionId: sourceQ.id,
      sourceOptionId: option.id,
      operator: SurveyConditionOperator.IS_SELECTED,
    },
  });

  // Deleting the source question should cascade and audit the condition
  await deleteQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQ.id,
  });

  const conditionLogs = await db.auditLog.findMany({
    where: {
      entityId: survey.id,
      action: "SURVEY_CONDITION_REMOVED",
    },
  });
  assert.equal(conditionLogs.length, 1);

  // Condition should be gone
  const conditions = await db.surveyQuestionCondition.findMany({
    where: { targetQuestionId: targetQ.id },
  });
  assert.equal(conditions.length, 0);
});

test("questions: cross-survey question ID is rejected", async () => {
  const { addQuestion, updateQuestion, deleteQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const s1 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Survey 1",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const s2 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Survey 2",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: s1.id,
    prompt: "Q from S1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    updateQuestion({
      actorUserId: adminId,
      surveyId: s2.id,
      questionId: q.id,
      prompt: "Hacked",
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    deleteQuestion({
      actorUserId: adminId,
      surveyId: s2.id,
      questionId: q.id,
    }),
    SurveyServiceError,
  );
});

test("questions: reorder questions", async () => {
  const { addQuestion, reorderQuestions } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Reorder",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const q2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q2",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const q3 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q3",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await reorderQuestions({
    actorUserId: adminId,
    surveyId: survey.id,
    questionIds: [q3.id, q1.id, q2.id],
  });

  const questions = await db.surveyQuestion.findMany({
    where: { surveyId: survey.id },
    orderBy: { sortOrder: "asc" },
  });

  assert.equal(questions[0].id, q3.id);
  assert.equal(questions[0].sortOrder, 0);
  assert.equal(questions[1].id, q1.id);
  assert.equal(questions[1].sortOrder, 1);
  assert.equal(questions[2].id, q2.id);
  assert.equal(questions[2].sortOrder, 2);
});

test("questions: reorder rejects incomplete or cross-survey IDs", async () => {
  const { addQuestion, reorderQuestions } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Reorder validation",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const q2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q2",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  // Incomplete list
  await assert.rejects(
    reorderQuestions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionIds: [q1.id],
    }),
    SurveyServiceError,
  );

  // Cross-survey ID
  await assert.rejects(
    reorderQuestions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionIds: [q1.id, "fake-id"],
    }),
    SurveyServiceError,
  );

  // Duplicates
  await assert.rejects(
    reorderQuestions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionIds: [q1.id, q1.id],
    }),
    SurveyServiceError,
  );
});

test("questions: unauthorized user cannot edit", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Unauthorized",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addQuestion({
      actorUserId: userId,
      surveyId: survey.id,
      prompt: "Should fail",
      type: SurveyQuestionType.SHORT_TEXT,
    }),
    SurveyServiceError,
  );
});

test("questions: collaborator can add questions", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Collaborator edit",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await db.surveyCollaborator.create({
    data: { surveyId: survey.id, userId },
  });

  const q = await addQuestion({
    actorUserId: userId,
    surveyId: survey.id,
    prompt: "Collaborator question",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  assert.equal(q.prompt, "Collaborator question");
});

// ──────────────────────────────────────────────
// Option tests
// ──────────────────────────────────────────────

