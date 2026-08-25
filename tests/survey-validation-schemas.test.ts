import assert from "node:assert/strict";
import test from "node:test";

import { registerBusinessRuleTestHooks } from "./business-rules-helpers";

registerBusinessRuleTestHooks();

test("survey metadata editor validation rejects empty title and invalid kind", async () => {
  const { createSurveySchema } = await import("@/lib/survey-validators");
  const { SurveyKind } = await import("@prisma/client");

  // Empty title
  const result1 = createSurveySchema.safeParse({
    title: "",
    description: "",
    kind: SurveyKind.SATISFACTION,
    identityMode: "NAMED",
  });
  assert.equal(result1.success, false);
  if (!result1.success) {
    assert.ok(result1.error.flatten().fieldErrors.title);
  }

  // Valid
  const result2 = createSurveySchema.safeParse({
    title: "Valid survey",
    description: "A description",
    kind: SurveyKind.SATISFACTION,
    identityMode: "NAMED",
  });
  assert.equal(result2.success, true);

  // Very long title
  const result3 = createSurveySchema.safeParse({
    title: "x".repeat(201),
    description: "",
    kind: SurveyKind.SATISFACTION,
    identityMode: "NAMED",
  });
  assert.equal(result3.success, false);
});

test("survey metadata editor validation rejects invalid kind and identity mode", async () => {
  const { createSurveySchema } = await import("@/lib/survey-validators");

  // Invalid kind
  const result1 = createSurveySchema.safeParse({
    title: "Test",
    description: "",
    kind: "INVALID_KIND",
    identityMode: "NAMED",
  });
  assert.equal(result1.success, false);

  // Invalid identity mode
  const result2 = createSurveySchema.safeParse({
    title: "Test",
    description: "",
    kind: "SATISFACTION",
    identityMode: "INVALID_MODE",
  });
  assert.equal(result2.success, false);
});

test("survey metadata editor update schema validates dates and times", async () => {
  const { updateMetadataSchema } = await import("@/lib/survey-validators");

  // Valid update with all fields
  const result1 = updateMetadataSchema.safeParse({
    surveyId: "test-id",
    title: "Updated survey",
    kind: "SATISFACTION",
    identityMode: "NAMED",
  });
  assert.equal(result1.success, true);

  // Invalid time format
  const result2 = updateMetadataSchema.safeParse({
    surveyId: "test-id",
    title: "Test",
    startTime: "09:30",
  });
  assert.equal(result2.success, false);

  // Valid time format
  const result3 = updateMetadataSchema.safeParse({
    surveyId: "test-id",
    title: "Test",
    startTime: "09:00",
  });
  assert.equal(result3.success, true);

  // Empty title
  const result4 = updateMetadataSchema.safeParse({
    surveyId: "test-id",
    title: "",
  });
  assert.equal(result4.success, false);

  // Title too long
  const result5 = updateMetadataSchema.safeParse({
    surveyId: "test-id",
    title: "x".repeat(201),
  });
  assert.equal(result5.success, false);
});

// S14 — Basic question builder validation schemas

test("survey question builder schemas validate prompt, type, and required", async () => {
  const { addQuestionSchema, updateQuestionSchema, deleteQuestionSchema } =
    await import("@/lib/survey-validators");

  // Valid add
  const add1 = addQuestionSchema.safeParse({
    surveyId: "survey-1",
    prompt: "How was your experience?",
    type: "SHORT_TEXT",
    required: false,
  });
  assert.equal(add1.success, true);

  // Empty prompt is rejected
  const add2 = addQuestionSchema.safeParse({
    surveyId: "survey-1",
    prompt: "   ",
    type: "SHORT_TEXT",
    required: true,
  });
  assert.equal(add2.success, false);
  if (!add2.success) {
    assert.ok(add2.error.flatten().fieldErrors.prompt);
  }

  // Invalid type is rejected
  const add3 = addQuestionSchema.safeParse({
    surveyId: "survey-1",
    prompt: "Question",
    type: "INVALID_TYPE",
    required: false,
  });
  assert.equal(add3.success, false);

  // Valid update with help text
  const update1 = updateQuestionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Updated prompt",
    helpText: "Some help",
    type: "MULTIPLE_CHOICE",
    required: true,
  });
  assert.equal(update1.success, true);

  // Missing question id is rejected
  const update2 = updateQuestionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "",
    prompt: "Updated prompt",
    type: "SHORT_TEXT",
    required: false,
  });
  assert.equal(update2.success, false);

  // Valid delete
  const delete1 = deleteQuestionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
  });
  assert.equal(delete1.success, true);

  // Missing survey id is rejected
  const delete2 = deleteQuestionSchema.safeParse({
    surveyId: "",
    questionId: "question-1",
  });
  assert.equal(delete2.success, false);
});

// S15 option and reorder schema tests

test("survey option schemas validate label, questionId, and surveyId", async () => {
  const {
    addOptionSchema,
    updateOptionSchema,
    deleteOptionSchema,
  } = await import("@/lib/survey-validators");

  // Valid add
  const add1 = addOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    label: "گزینه ۱",
  });
  assert.equal(add1.success, true);

  // Empty label is rejected
  const add2 = addOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    label: "   ",
  });
  assert.equal(add2.success, false);

  // Missing questionId is rejected
  const add3 = addOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "",
    label: "Option",
  });
  assert.equal(add3.success, false);

  // Valid update
  const update1 = updateOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    optionId: "option-1",
    label: "Updated",
  });
  assert.equal(update1.success, true);

  // Missing optionId is rejected
  const update2 = updateOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    optionId: "",
    label: "Option",
  });
  assert.equal(update2.success, false);

  // Valid delete
  const delete1 = deleteOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    optionId: "option-1",
  });
  assert.equal(delete1.success, true);
});

test("survey reorder schemas validate arrays", async () => {
  const { reorderOptionsSchema, reorderQuestionsSchema } = await import(
    "@/lib/survey-validators"
  );

  // Valid option reorder
  const opts1 = reorderOptionsSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    optionIds: ["opt-1", "opt-2", "opt-3"],
  });
  assert.equal(opts1.success, true);

  // Empty optionIds array is rejected
  const opts2 = reorderOptionsSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    optionIds: [],
  });
  assert.equal(opts2.success, false);

  // Valid question reorder
  const qs1 = reorderQuestionsSchema.safeParse({
    surveyId: "survey-1",
    questionIds: ["q-1", "q-2"],
  });
  assert.equal(qs1.success, true);

  // Empty questionIds array is rejected
  const qs2 = reorderQuestionsSchema.safeParse({
    surveyId: "survey-1",
    questionIds: [],
  });
  assert.equal(qs2.success, false);
});

test("survey update question with config schema validates rating and maxSelections", async () => {
  const { updateQuestionWithConfigSchema } = await import(
    "@/lib/survey-validators"
  );

  // Valid update with rating config
  const u1 = updateQuestionWithConfigSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Rate us",
    type: "RATING",
    required: true,
    ratingMin: 0,
    ratingMax: 10,
    ratingMinLabel: "Bad",
    ratingMaxLabel: "Good",
    maxSelections: null,
  });
  assert.equal(u1.success, true);

  // Valid update with maxSelections
  const u2 = updateQuestionWithConfigSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Pick some",
    type: "MULTIPLE_CHOICE",
    required: false,
    maxSelections: 3,
  });
  assert.equal(u2.success, true);

  // Rating min >= max is rejected by service, not schema (schema allows 0-10 range)
  const u3 = updateQuestionWithConfigSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Rate us",
    type: "RATING",
    required: true,
    ratingMin: 5,
    ratingMax: 5,
  });
  assert.equal(u3.success, true);

  // Rating out of range is rejected
  const u4 = updateQuestionWithConfigSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Rate us",
    type: "RATING",
    required: true,
    ratingMin: -1,
    ratingMax: 5,
  });
  assert.equal(u4.success, false);

  // maxSelections 0 is rejected
  const u5 = updateQuestionWithConfigSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Pick some",
    type: "MULTIPLE_CHOICE",
    required: false,
    maxSelections: 0,
  });
  assert.equal(u5.success, false);
});
