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

test("options: add and return options to choice questions", async () => {
  const { addQuestion, addOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Option add",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt1 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "Option A",
  });
  assert.equal(opt1.label, "Option A");
  assert.equal(opt1.sortOrder, 0);

  const opt2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "Option B",
  });
  assert.equal(opt2.sortOrder, 1);
});

test("options: cannot add to non-choice question", async () => {
  const { addQuestion, addOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Non-choice option",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Text",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    addOption({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      label: "Option",
    }),
    SurveyServiceError,
  );
});

test("options: duplicate label rejected", async () => {
  const { addQuestion, addOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Duplicate option",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "Option A",
  });

  await assert.rejects(
    addOption({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      label: "Option A",
    }),
    SurveyServiceError,
  );
});

test("options: update option label", async () => {
  const { addQuestion, addOption, updateOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Update option",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "Old label",
  });

  const updated = await updateOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    optionId: opt.id,
    label: "New label",
  });
  assert.equal(updated.label, "New label");
});

test("options: delete option normalizes sort order", async () => {
  const { addQuestion, addOption, deleteOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Delete option",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt1 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "A",
  });
  const opt2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "B",
  });
  const opt3 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "C",
  });

  await deleteOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    optionId: opt2.id,
  });

  const remaining = await db.surveyOption.findMany({
    where: { questionId: q.id },
    orderBy: { sortOrder: "asc" },
  });

  assert.equal(remaining.length, 2);
  assert.equal(remaining[0].id, opt1.id);
  assert.equal(remaining[0].sortOrder, 0);
  assert.equal(remaining[1].id, opt3.id);
  assert.equal(remaining[1].sortOrder, 1);
});

test("options: delete option with dependent condition audits it", async () => {
  const { addQuestion, addOption, deleteOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Delete option condition",
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
  const opt = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQ.id,
    label: "Yes",
  });

  await db.surveyQuestionCondition.create({
    data: {
      targetQuestionId: targetQ.id,
      sourceQuestionId: sourceQ.id,
      sourceOptionId: opt.id,
      operator: SurveyConditionOperator.IS_SELECTED,
    },
  });

  await deleteOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQ.id,
    optionId: opt.id,
  });

  const conditionLogs = await db.auditLog.findMany({
    where: {
      entityId: survey.id,
      action: "SURVEY_CONDITION_REMOVED",
    },
  });
  assert.equal(conditionLogs.length, 1);

  const conditions = await db.surveyQuestionCondition.findMany({
    where: { sourceOptionId: opt.id },
  });
  assert.equal(conditions.length, 0);
});

test("options: cross-survey option ID is rejected", async () => {
  const { addQuestion, addOption, updateOption, deleteOption } = await import(
    "@/lib/survey-service/questions"
  );

  const s1 = await createSurveyDraft({
    actorUserId: adminId,
    title: "S1",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const s2 = await createSurveyDraft({
    actorUserId: adminId,
    title: "S2",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q1 = await addQuestion({
    actorUserId: adminId,
    surveyId: s1.id,
    prompt: "Q1",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  await addQuestion({
    actorUserId: adminId,
    surveyId: s2.id,
    prompt: "Q2",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt = await addOption({
    actorUserId: adminId,
    surveyId: s1.id,
    questionId: q1.id,
    label: "Option",
  });

  // Wrong survey
  await assert.rejects(
    updateOption({
      actorUserId: adminId,
      surveyId: s2.id,
      questionId: q1.id,
      optionId: opt.id,
      label: "Hacked",
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    deleteOption({
      actorUserId: adminId,
      surveyId: s2.id,
      questionId: q1.id,
      optionId: opt.id,
    }),
    SurveyServiceError,
  );
});

test("options: reorder options", async () => {
  const { addQuestion, addOption, reorderOptions } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Reorder options",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt1 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "A",
  });
  const opt2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "B",
  });
  const opt3 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "C",
  });

  await reorderOptions({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    optionIds: [opt3.id, opt1.id, opt2.id],
  });

  const options = await db.surveyOption.findMany({
    where: { questionId: q.id },
    orderBy: { sortOrder: "asc" },
  });

  assert.equal(options[0].id, opt3.id);
  assert.equal(options[0].sortOrder, 0);
  assert.equal(options[1].id, opt1.id);
  assert.equal(options[1].sortOrder, 1);
  assert.equal(options[2].id, opt2.id);
  assert.equal(options[2].sortOrder, 2);
});

test("options: reorder rejects incomplete or invalid IDs", async () => {
  const { addQuestion, addOption, reorderOptions } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Reorder validation",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt1 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "A",
  });
  const opt2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "B",
  });

  await assert.rejects(
    reorderOptions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      optionIds: [opt1.id],
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    reorderOptions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      optionIds: [opt1.id, "fake-id"],
    }),
    SurveyServiceError,
  );
});

test("options: empty label is rejected", async () => {
  const { addQuestion, addOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Empty label",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  await assert.rejects(
    addOption({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      label: "   ",
    }),
    SurveyServiceError,
  );
});

test("questions: changing a choice to a non-choice clears options and conditions", async () => {
  const { addOption, addQuestion, updateQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Question type cleanup",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const sourceQuestion = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
    randomizeOptions: true,
  });
  const targetQuestion = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const sourceOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQuestion.id,
    label: "Yes",
  });
  await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQuestion.id,
    label: "No",
  });
  await db.surveyQuestionCondition.create({
    data: {
      targetQuestionId: targetQuestion.id,
      sourceQuestionId: sourceQuestion.id,
      sourceOptionId: sourceOption.id,
      operator: SurveyConditionOperator.IS_SELECTED,
    },
  });

  const updated = await updateQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQuestion.id,
    type: SurveyQuestionType.LONG_TEXT,
  });

  assert.equal(updated.type, SurveyQuestionType.LONG_TEXT);
  assert.equal(updated.randomizeOptions, false);
  assert.equal(
    await db.surveyOption.count({
      where: { questionId: sourceQuestion.id },
    }),
    0,
  );
  assert.equal(
    await db.surveyQuestionCondition.count({
      where: { sourceQuestionId: sourceQuestion.id },
    }),
    0,
  );
  assert.equal(
    await db.auditLog.count({
      where: {
        entityId: survey.id,
        action: "SURVEY_CONDITION_REMOVED",
      },
    }),
    1,
  );
});

test("questions: rating configuration is normalized and cannot be retained by other types", async () => {
  const { addQuestion, updateQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Rating configuration",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Invalid text configuration",
      type: SurveyQuestionType.SHORT_TEXT,
      ratingMin: 1,
    }),
    SurveyServiceError,
  );

  const rating = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Default rating",
    type: SurveyQuestionType.RATING,
  });
  assert.equal(rating.ratingMin, 1);
  assert.equal(rating.ratingMax, 5);

  await assert.rejects(
    updateQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: rating.id,
      ratingMin: null,
    }),
    SurveyServiceError,
  );

  const text = await updateQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: rating.id,
    type: SurveyQuestionType.SHORT_TEXT,
  });
  assert.equal(text.ratingMin, null);
  assert.equal(text.ratingMax, null);
  assert.equal(text.ratingMinLabel, null);
  assert.equal(text.ratingMaxLabel, null);
});

test("questions: publish validation enforces complete unique choice configuration", async () => {
  const {
    addOption,
    addQuestion,
    assertSurveyQuestionsReadyForPublish,
  } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Publish validation",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const choice = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Choice",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const firstOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: choice.id,
    label: "First",
  });

  await assert.rejects(
    assertSurveyQuestionsReadyForPublish(survey.id, db),
    SurveyServiceError,
  );

  const secondOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: choice.id,
    label: "Second",
  });
  await assert.doesNotReject(
    assertSurveyQuestionsReadyForPublish(survey.id, db),
  );

  await db.surveyOption.update({
    where: { id: secondOption.id },
    data: { label: firstOption.label },
  });
  await assert.rejects(
    assertSurveyQuestionsReadyForPublish(survey.id, db),
    SurveyServiceError,
  );
});

test("questions: publish validation rejects max selections above option count", async () => {
  const {
    addOption,
    addQuestion,
    assertSurveyQuestionsReadyForPublish,
  } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Maximum selections",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const question = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Choose",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
    maxSelections: 3,
  });
  await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: question.id,
    label: "First",
  });
  await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: question.id,
    label: "Second",
  });

  await assert.rejects(
    assertSurveyQuestionsReadyForPublish(survey.id, db),
    SurveyServiceError,
  );
});

test("questions: inserts repair non-contiguous question and option order", async () => {
  const { addOption, addQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Insert normalization",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const firstQuestion = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "First",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const secondQuestion = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Second",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  await db.surveyQuestion.update({
    where: { id: secondQuestion.id },
    data: { sortOrder: 5 },
  });

  const thirdQuestion = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Third",
    type: SurveyQuestionType.LONG_TEXT,
  });
  const questions = await db.surveyQuestion.findMany({
    where: { surveyId: survey.id },
    orderBy: { sortOrder: "asc" },
  });
  assert.deepEqual(
    questions.map((question) => [question.id, question.sortOrder]),
    [
      [firstQuestion.id, 0],
      [secondQuestion.id, 1],
      [thirdQuestion.id, 2],
    ],
  );

  const firstOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: firstQuestion.id,
    label: "First",
  });
  const secondOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: firstQuestion.id,
    label: "Second",
  });
  await db.surveyOption.update({
    where: { id: secondOption.id },
    data: { sortOrder: 5 },
  });

  const thirdOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: firstQuestion.id,
    label: "Third",
  });
  const options = await db.surveyOption.findMany({
    where: { questionId: firstQuestion.id },
    orderBy: { sortOrder: "asc" },
  });
  assert.deepEqual(
    options.map((option) => [option.id, option.sortOrder]),
    [
      [firstOption.id, 0],
      [secondOption.id, 1],
      [thirdOption.id, 2],
    ],
  );
});

// ──────────────────────────────────────────────
// Condition operations
// ──────────────────────────────────────────────
