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

test("conditions: set a valid condition on a target question", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Condition test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source.id,
    label: "Yes",
  });

  await setQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
    sourceQuestionId: source.id,
    sourceOptionId: option.id,
    operator: "IS_SELECTED",
  });

  const condition = await db.surveyQuestionCondition.findUnique({
    where: { targetQuestionId: target.id },
  });
  assert.ok(condition);
  assert.equal(condition.sourceQuestionId, source.id);
  assert.equal(condition.sourceOptionId, option.id);
  assert.equal(condition.operator, "IS_SELECTED");
});

test("conditions: replacing an existing condition updates it", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Condition replace",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source 1",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const source2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source 2",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.LONG_TEXT,
  });
  const option1 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source1.id,
    label: "A",
  });
  const option2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source2.id,
    label: "B",
  });

  await setQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
    sourceQuestionId: source1.id,
    sourceOptionId: option1.id,
    operator: "IS_SELECTED",
  });

  await setQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
    sourceQuestionId: source2.id,
    sourceOptionId: option2.id,
    operator: "IS_NOT_SELECTED",
  });

  const conditions = await db.surveyQuestionCondition.findMany({
    where: { targetQuestionId: target.id },
  });
  assert.equal(conditions.length, 1);
  assert.equal(conditions[0].sourceQuestionId, source2.id);
  assert.equal(conditions[0].sourceOptionId, option2.id);
  assert.equal(conditions[0].operator, "IS_NOT_SELECTED");
});

test("conditions: remove a condition", async () => {
  const { addQuestion, addOption, setQuestionCondition, removeQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Remove condition",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source.id,
    label: "Yes",
  });

  await setQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
    sourceQuestionId: source.id,
    sourceOptionId: option.id,
    operator: "IS_SELECTED",
  });

  await removeQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
  });

  const condition = await db.surveyQuestionCondition.findUnique({
    where: { targetQuestionId: target.id },
  });
  assert.equal(condition, null);
});

test("conditions: self-reference is rejected", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Self-ref",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const question = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Self",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: question.id,
    label: "Yes",
  });

  await assert.rejects(
    setQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: question.id,
      sourceQuestionId: question.id,
      sourceOptionId: option.id,
      operator: "IS_SELECTED",
    }),
    SurveyServiceError,
  );
});

test("conditions: source after target is rejected", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Order",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target (first)",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source (second)",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source.id,
    label: "Yes",
  });

  await assert.rejects(
    setQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
      sourceQuestionId: source.id,
      sourceOptionId: option.id,
      operator: "IS_SELECTED",
    }),
    SurveyServiceError,
  );
});

test("conditions: reordering cannot move a target before its source", async () => {
  const {
    addOption,
    addQuestion,
    reorderQuestions,
    setQuestionCondition,
  } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Condition reorder",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source.id,
    label: "Yes",
  });
  await setQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
    sourceQuestionId: source.id,
    sourceOptionId: option.id,
    operator: "IS_SELECTED",
  });

  const auditCountBefore = await db.auditLog.count({
    where: {
      entityId: survey.id,
      action: "SURVEY_QUESTIONS_REORDERED",
    },
  });

  await assert.rejects(
    reorderQuestions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionIds: [target.id, source.id],
    }),
    SurveyServiceError,
  );

  const questions = await db.surveyQuestion.findMany({
    where: { surveyId: survey.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  assert.deepEqual(questions, [
    { id: source.id, sortOrder: 0 },
    { id: target.id, sortOrder: 1 },
  ]);
  assert.equal(
    await db.auditLog.count({
      where: {
        entityId: survey.id,
        action: "SURVEY_QUESTIONS_REORDERED",
      },
    }),
    auditCountBefore,
  );
});

test("conditions: cross-survey source question is rejected", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Cross-survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const otherSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Other survey",
    kind: SurveyKind.DATA_COLLECTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: otherSurvey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: otherSurvey.id,
    questionId: source.id,
    label: "Yes",
  });

  await assert.rejects(
    setQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
      sourceQuestionId: source.id,
      sourceOptionId: option.id,
      operator: "IS_SELECTED",
    }),
    SurveyServiceError,
  );
});

test("conditions: non-choice source question is rejected", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Non-choice",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Text source",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.LONG_TEXT,
  });
  const dummyChoice = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Dummy choice",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: dummyChoice.id,
    label: "Dummy",
  });

  await assert.rejects(
    setQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
      sourceQuestionId: source.id,
      sourceOptionId: option.id,
      operator: "IS_SELECTED",
    }),
    SurveyServiceError,
  );
});

test("conditions: option not belonging to source question is rejected", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Wrong option",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source 1",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const source2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source 2",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const optionFromSource2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source2.id,
    label: "Wrong",
  });

  await assert.rejects(
    setQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
      sourceQuestionId: source1.id,
      sourceOptionId: optionFromSource2.id,
      operator: "IS_SELECTED",
    }),
    SurveyServiceError,
  );
});

test("conditions: remove non-existent condition is rejected", async () => {
  const { addQuestion, removeQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "No condition",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    removeQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
    }),
    SurveyServiceError,
  );
});

test("conditions: cross-survey target question is rejected on remove", async () => {
  const { addQuestion, removeQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Cross rm",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const otherSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Other",
    kind: SurveyKind.DATA_COLLECTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: otherSurvey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    removeQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
    }),
    SurveyServiceError,
  );
});

