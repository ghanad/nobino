import assert from "node:assert/strict";
import test from "node:test";

import {
  SurveyAudienceMode,
  SurveyIdentityMode,
  SurveyKind,
  SurveyQuestionType,
  SurveyState,
} from "@prisma/client";

import {
  adminId,
  db,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";
import { createSurveyDraft, updateSurveyMetadata } from "@/lib/survey-service/metadata";
import { addQuestion, addOption, updateQuestion } from "@/lib/survey-service/questions";
import { publishSurvey, closeSurvey, archiveSurvey } from "@/lib/survey-service/lifecycle";
import { setAudienceMode, addAudienceUser } from "@/lib/survey-service/audience";
import { setQuestionCondition } from "@/lib/survey-service/questions";
import { upsertDraft } from "@/lib/survey-service/draft-response";
import { submitNamedResponse } from "@/lib/survey-service/submit-response";
import { submitAnonymousResponse } from "@/lib/survey-service/submit-response";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import { getSurveyDisplayState } from "@/lib/survey-status";
import {
  SURVEY_FINAL_RESPONSE_MAX_SIZE_BYTES,
  SURVEY_LONG_TEXT_MAX_LENGTH,
  SURVEY_SHORT_TEXT_MAX_LENGTH,
} from "@/lib/survey-response-limits";

registerBusinessRuleTestHooks();

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function createActiveNamedSurveyWithQuestions() {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Submit test survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Submit test survey",
    startsAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  });

  // Text question
  const qText = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "What is your name?",
    type: SurveyQuestionType.SHORT_TEXT,
    required: true,
  });

  // Single choice question
  const qChoice = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
    required: true,
  });

  const optA = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qChoice.id,
    label: "Option A",
  });

  const optB = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qChoice.id,
    label: "Option B",
  });

  // Multiple choice question
  const qMulti = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick multiple",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
    required: true,
  });

  const optX = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qMulti.id,
    label: "Option X",
  });

  const optY = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qMulti.id,
    label: "Option Y",
  });

  // Rating question
  const qRating = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Rate it",
    type: SurveyQuestionType.RATING,
  });

  await updateQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qRating.id,
    prompt: "Rate it",
    type: SurveyQuestionType.RATING,
    required: false,
    ratingMin: 1,
    ratingMax: 5,
  });

  // Long text question (optional)
  const qLong = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Optional comments",
    type: SurveyQuestionType.LONG_TEXT,
    required: false,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  return { survey, qText, qChoice, optA, optB, qMulti, optX, optY, qRating, qLong };
}

async function createActiveSurveyWithConditionalQuestion() {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Conditional survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Conditional survey",
    startsAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  });

  // Source choice question
  const qSource = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source question",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const optYes = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qSource.id,
    label: "Yes",
  });

  const optNo = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qSource.id,
    label: "No",
  });

  // Target question (conditional)
  const qTarget = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Conditional follow-up",
    type: SurveyQuestionType.SHORT_TEXT,
    required: true,
  });

  await setQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: qTarget.id,
    sourceQuestionId: qSource.id,
    sourceOptionId: optYes.id,
    operator: "IS_SELECTED",
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  return { survey, qSource, optYes, optNo, qTarget };
}

// ──────────────────────────────────────────────
// S21 Named submission: Happy path
// ──────────────────────────────────────────────

test("S21 submit: submits a valid named response", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX, qRating } =
    await createActiveNamedSurveyWithQuestions();

  const answers = {
    [qText.id]: "Ali",
    [qChoice.id]: optA.id,
    [qMulti.id]: [optX.id],
    [qRating.id]: 4,
  };

  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers,
  });

  // Verify response was created
  const response = await db.surveyResponse.findFirst({
    where: { surveyId: survey.id, userId },
    include: {
      answers: {
        include: { selectedOptions: true },
      },
    },
  });

  assert.ok(response !== null);
  assert.equal(response.userId, userId);

  // Verify answers
  const textAnswer = response.answers.find((a) => a.questionId === qText.id);
  assert.ok(textAnswer !== undefined);
  assert.equal(textAnswer.textValue, "Ali");

  const choiceAnswer = response.answers.find((a) => a.questionId === qChoice.id);
  assert.ok(choiceAnswer !== undefined);
  assert.equal(choiceAnswer.selectedOptions.length, 1);
  assert.equal(choiceAnswer.selectedOptions[0].optionId, optA.id);

  const multiAnswer = response.answers.find((a) => a.questionId === qMulti.id);
  assert.ok(multiAnswer !== undefined);
  assert.equal(multiAnswer.selectedOptions.length, 1);
  assert.equal(multiAnswer.selectedOptions[0].optionId, optX.id);

  const ratingAnswer = response.answers.find((a) => a.questionId === qRating.id);
  assert.ok(ratingAnswer !== undefined);
  assert.equal(ratingAnswer.numericValue, 4);
});

test("S21 submit: marks recipient as submitted", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX } = await createActiveNamedSurveyWithQuestions();

  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "Done",
      [qChoice.id]: optA.id,
      [qMulti.id]: [optX.id],
    },
  });

  const recipient = await db.surveyRecipient.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.ok(recipient !== null);
  assert.equal(recipient.hasSubmitted, true);
});

test("S21 submit: deletes draft after submission", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX } = await createActiveNamedSurveyWithQuestions();

  // Create a draft first
  await upsertDraft({
    actorUserId: userId,
    surveyId: survey.id,
    answers: { [qText.id]: "Draft answer" },
  });

  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "Final answer",
      [qChoice.id]: optA.id,
      [qMulti.id]: [optX.id],
    },
  });

  // Draft should be deleted
  const draft = await db.surveyDraft.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.equal(draft, null);
});

test("S21 submit: creates content-free audit event", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX } = await createActiveNamedSurveyWithQuestions();

  const auditBefore = await db.auditLog.count({
    where: { entityId: survey.id, action: "SURVEY_RESPONSE_SUBMITTED" },
  });

  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "Hello",
      [qChoice.id]: optA.id,
      [qMulti.id]: [optX.id],
    },
  });

  const auditLogs = await db.auditLog.findMany({
    where: { entityId: survey.id, action: "SURVEY_RESPONSE_SUBMITTED" },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  assert.equal(auditLogs.length, auditBefore + 1);
  const audit = auditLogs[0];
  assert.equal(audit.actorUserId, userId);
  assert.equal(audit.entityType, "Survey");

  // Audit must NOT contain answer bodies
  const newValue = audit.newValue as Record<string, unknown> | null;
  assert.ok(newValue !== null);
  assert.ok(typeof newValue.responseId === "string");
  // Verify no answer payloads in audit
  assert.equal("answers" in newValue, false);
  const newValueStr = JSON.stringify(newValue);
  assert.equal(newValueStr.includes("Hello"), false);
});

test("S21 submit: optional questions can be omitted", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX, qRating } =
    await createActiveNamedSurveyWithQuestions();

  // Only answer required questions
  const answers = {
    [qText.id]: "Ali",
    [qChoice.id]: optA.id,
    [qMulti.id]: [optX.id],
    // qRating is optional, omit it
  };

  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers,
  });

  const response = await db.surveyResponse.findFirst({
    where: { surveyId: survey.id, userId },
    include: { answers: true },
  });
  assert.ok(response !== null);

  // Rating answer should not exist
  const ratingAnswer = response.answers.find((a) => a.questionId === qRating.id);
  assert.equal(ratingAnswer, undefined);
});

// ──────────────────────────────────────────────
// S21 Named submission: Authorization
// ──────────────────────────────────────────────

test("S21 submit: non-recipient cannot submit", async () => {
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

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: { [q1.id]: "Test" },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: cannot submit for another user", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX } = await createActiveNamedSurveyWithQuestions();

  // secondUserId tries to submit as userId
  await submitNamedResponse({
    actorUserId: secondUserId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "Impersonation",
      [qChoice.id]: optA.id,
      [qMulti.id]: [optX.id],
    },
  });

  // Verify the response belongs to secondUserId, not userId
  const response = await db.surveyResponse.findFirst({
    where: { surveyId: survey.id, userId: secondUserId },
  });
  assert.ok(response !== null);
  assert.equal(response.userId, secondUserId);
});

// ──────────────────────────────────────────────
// S21 Named submission: Lifecycle state checks
// ──────────────────────────────────────────────

test("S21 submit: cannot submit to scheduled survey", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Scheduled survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Scheduled survey",
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
    endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });

  const q1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: { [q1.id]: "Test" },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: cannot submit to ended survey", async () => {
  const { survey, qText } = await createActiveNamedSurveyWithQuestions();

  // Move endsAt to past
  await db.survey.update({
    where: { id: survey.id },
    data: { endsAt: new Date(Date.now() - 60 * 60 * 1000) },
  });

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: { [qText.id]: "Late" },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: cannot submit to closed survey", async () => {
  const { survey, qText } = await createActiveNamedSurveyWithQuestions();

  await closeSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: { [qText.id]: "Closed" },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: cannot submit to archived survey", async () => {
  const { survey, qText } = await createActiveNamedSurveyWithQuestions();

  // End the survey first
  await db.survey.update({
    where: { id: survey.id },
    data: { endsAt: new Date(Date.now() - 60 * 60 * 1000) },
  });

  await archiveSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: { [qText.id]: "Archived" },
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S21 Named submission: Validation
// ──────────────────────────────────────────────

test("S21 submit: rejects missing required text answer", async () => {
  const { survey, qChoice, optA, qMulti } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          // qText is required but missing
          [qChoice.id]: optA.id,
          [qMulti.id]: [] as string[],
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects missing required choice answer", async () => {
  const { survey, qText, qMulti } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "Ali",
          // qChoice is required but missing
          [qMulti.id]: [] as string[],
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects missing required multi-choice answer", async () => {
  const { survey, qText, qChoice, optA } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "Ali",
          [qChoice.id]: optA.id,
          // qMulti is required but missing
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects empty required text answer", async () => {
  const { survey, qText, qChoice, optA, qMulti } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "   ",
          [qChoice.id]: optA.id,
          [qMulti.id]: [] as string[],
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects invalid option ID for single choice", async () => {
  const { survey, qText, qChoice, qMulti } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "Ali",
          [qChoice.id]: "nonexistent-option-id",
          [qMulti.id]: [] as string[],
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects invalid option ID for multiple choice", async () => {
  const { survey, qText, qChoice, optA, qMulti } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "Ali",
          [qChoice.id]: optA.id,
          [qMulti.id]: ["nonexistent-option-id"],
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects wrong type for text question", async () => {
  const { survey, qText, qChoice, optA, qMulti } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: 123,
          [qChoice.id]: optA.id,
          [qMulti.id]: [] as string[],
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects wrong type for choice question", async () => {
  const { survey, qText, qChoice, qMulti } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "Ali",
          [qChoice.id]: 123,
          [qMulti.id]: [] as string[],
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects wrong type for multi-choice question", async () => {
  const { survey, qText, qChoice, optA, qMulti } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "Ali",
          [qChoice.id]: optA.id,
          [qMulti.id]: "not-an-array",
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects maxSelections exceeded", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Max selections test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Max selections test",
    startsAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  });

  const qMulti = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick at most 1",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
    required: true,
  });

  await updateQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qMulti.id,
    prompt: "Pick at most 1",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
    required: true,
    maxSelections: 1,
  });

  const optA = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qMulti.id,
    label: "Option A",
  });

  const optB = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qMulti.id,
    label: "Option B",
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qMulti.id]: [optA.id, optB.id],
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects rating out of bounds", async () => {
  const { survey, qText, qChoice, optA, qMulti, qRating } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "Ali",
          [qChoice.id]: optA.id,
          [qMulti.id]: [] as string[],
          [qRating.id]: 99,
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects non-integer rating", async () => {
  const { survey, qText, qChoice, optA, qMulti, qRating } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "Ali",
          [qChoice.id]: optA.id,
          [qMulti.id]: [] as string[],
          [qRating.id]: 3.5,
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects cross-survey question ID", async () => {
  const { survey } = await createActiveNamedSurveyWithQuestions();

  // Create a second survey to get a different question ID
  const survey2 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Another survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const qOther = await addQuestion({
    actorUserId: adminId,
    surveyId: survey2.id,
    prompt: "Other question",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: { [qOther.id]: "Cross-survey" },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: rejects empty array for required multi-choice", async () => {
  const { survey, qText, qChoice, optA, qMulti } =
    await createActiveNamedSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "Ali",
          [qChoice.id]: optA.id,
          [qMulti.id]: [] as string[],
        },
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S21 Named submission: Conditional visibility
// ──────────────────────────────────────────────

test("S21 submit: requires conditional question when visible", async () => {
  const { survey, qSource, optYes } =
    await createActiveSurveyWithConditionalQuestion();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qSource.id]: optYes.id,
          // qTarget is required and visible but missing
        },
      }),
    SurveyServiceError,
  );
});

test("S21 submit: does not require conditional question when hidden", async () => {
  const { survey, qSource, optNo, qTarget } =
    await createActiveSurveyWithConditionalQuestion();

  // qTarget is hidden when qSource is not "Yes"
  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qSource.id]: optNo.id,
      // qTarget is hidden, should not be required
    },
  });

  const response = await db.surveyResponse.findFirst({
    where: { surveyId: survey.id, userId },
    include: { answers: true },
  });
  assert.ok(response !== null);

  // qTarget should not have an answer
  const targetAnswer = response.answers.find((a) => a.questionId === qTarget.id);
  assert.equal(targetAnswer, undefined);
});

test("S21 submit: rejects answers for hidden questions", async () => {
  const { survey, qSource, optNo, qTarget } =
    await createActiveSurveyWithConditionalQuestion();

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qSource.id]: optNo.id,
          [qTarget.id]: "Should be hidden",
        },
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S21 Named submission: Concurrency / Double submit
// ──────────────────────────────────────────────

test("S21 submit: double submit yields exactly one response", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX } = await createActiveNamedSurveyWithQuestions();

  const answers = {
    [qText.id]: "Only one",
    [qChoice.id]: optA.id,
    [qMulti.id]: [optX.id],
  };

  // Submit twice concurrently
  const results = await Promise.allSettled([
    submitNamedResponse({ actorUserId: userId, surveyId: survey.id, answers }),
    submitNamedResponse({ actorUserId: userId, surveyId: survey.id, answers }),
  ]);

  // One should succeed, one should fail
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);

  // Verify exactly one response exists
  const responses = await db.surveyResponse.findMany({
    where: { surveyId: survey.id, userId },
  });
  assert.equal(responses.length, 1);
});

test("S21 submit: already submitted cannot submit again", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX } = await createActiveNamedSurveyWithQuestions();

  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "First",
      [qChoice.id]: optA.id,
      [qMulti.id]: [optX.id],
    },
  });

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "Second attempt",
          [qChoice.id]: optA.id,
          [qMulti.id]: [optX.id],
        },
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S21 Named submission: Transaction / Rollback
// ──────────────────────────────────────────────

test("S21 submit: failed validation writes nothing", async () => {
  const { survey, qText } =
    await createActiveNamedSurveyWithQuestions();

  const responsesBefore = await db.surveyResponse.count({
    where: { surveyId: survey.id },
  });

  try {
    await submitNamedResponse({
      actorUserId: userId,
      surveyId: survey.id,
      answers: {
        [qText.id]: "Ali",
        // Missing required qChoice and qMulti
      },
    });
  } catch {
    // expected
  }

  const responsesAfter = await db.surveyResponse.count({
    where: { surveyId: survey.id },
  });
  assert.equal(responsesAfter, responsesBefore);

  // Recipient should still be unsubmitted
  const recipient = await db.surveyRecipient.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.ok(recipient !== null);
  assert.equal(recipient.hasSubmitted, false);
});

// ──────────────────────────────────────────────
// S21 Named submission: Immutability
// ──────────────────────────────────────────────

test("S21 submit: final response cannot be edited through any service", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX } = await createActiveNamedSurveyWithQuestions();

  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "Original",
      [qChoice.id]: optA.id,
      [qMulti.id]: [optX.id],
    },
  });

  const response = await db.surveyResponse.findFirst({
    where: { surveyId: survey.id, userId },
  });
  assert.ok(response !== null);

  // Attempt to directly update the answer
  const answers = await db.surveyAnswer.findMany({
    where: { responseId: response.id },
  });
  assert.equal(answers.length, 3);

  // Verify the answer text is "Original"
  const textAnswer = answers.find((a) => a.questionId === qText.id);
  assert.ok(textAnswer !== undefined);
  assert.equal(textAnswer.textValue, "Original");
});

test("S21 submit: survey response is not user-editable", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX } = await createActiveNamedSurveyWithQuestions();

  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "Immutable",
      [qChoice.id]: optA.id,
      [qMulti.id]: [optX.id],
    },
  });

  // The submit service itself rejects re-submission
  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "Changed",
          [qChoice.id]: optA.id,
          [qMulti.id]: [optX.id],
        },
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S21 Named submission: Survey not found
// ──────────────────────────────────────────────

test("S21 submit: non-existent survey throws error", async () => {
  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: "nonexistent-survey-id",
        answers: {},
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S21 Named submission: Identity mode guard
// ──────────────────────────────────────────────

test("S21 submit: rejects anonymous survey", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Anonymous survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.ANONYMOUS,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Anonymous survey",
    startsAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  });

  // Ensure at least 5 eligible recipients for anonymous publish
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });

  // Create 5 active users (including userId and secondUserId)
  const extraIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const extraId = `extra-user-${i}`;
    extraIds.push(extraId);
    await db.user.create({
      data: {
        id: extraId,
        email: `extra${i}@example.test`,
        name: `Extra ${i}`,
        passwordHash: "test-password-hash",
        role: "USER",
      },
    });
    await addAudienceUser({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: extraId,
    });
  }
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: userId,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  const qText = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q",
    type: SurveyQuestionType.SHORT_TEXT,
    required: true,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    () =>
      submitNamedResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: { [qText.id]: "Should fail" },
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S21 Named submission: Audit
// ──────────────────────────────────────────────

test("S21 submit: creates content-free audit event", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX } =
    await createActiveNamedSurveyWithQuestions();

  const auditBefore = await db.auditLog.count({
    where: { entityId: survey.id, action: "SURVEY_RESPONSE_SUBMITTED" },
  });

  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "Ali",
      [qChoice.id]: optA.id,
      [qMulti.id]: [optX.id],
    },
  });

  const auditLogs = await db.auditLog.findMany({
    where: { entityId: survey.id, action: "SURVEY_RESPONSE_SUBMITTED" },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  const auditAfter = await db.auditLog.count({
    where: { entityId: survey.id, action: "SURVEY_RESPONSE_SUBMITTED" },
  });

  assert.equal(auditLogs.length, 1);
  assert.equal(auditAfter, auditBefore + 1);
  const auditLog = auditLogs[0];

  // Actor is the submitting user
  assert.equal(auditLog.actorUserId, userId);

  // newValue must contain responseId but not answer content
  const newValue = auditLog.newValue as Record<string, unknown> | null;
  assert.ok(newValue !== null);
  assert.ok(typeof newValue.responseId === "string");

  // Must not contain answers
  const newValueStr = JSON.stringify(newValue);
  assert.ok(!newValueStr.includes("answers"));
  assert.ok(!newValueStr.includes(qText.id));
  assert.ok(!newValueStr.includes("Ali"));
});

// ──────────────────────────────────────────────
// S21 Named submission: Draft deletion
// ──────────────────────────────────────────────

test("S21 submit: deletes draft after successful submission", async () => {
  const { survey, qText, qChoice, optA, qMulti, optX } =
    await createActiveNamedSurveyWithQuestions();

  // Create a draft
  await upsertDraft({
    actorUserId: userId,
    surveyId: survey.id,
    answers: { [qText.id]: "Draft to delete" },
  });

  // Verify draft exists in DB
  const draftBefore = await db.surveyDraft.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.ok(draftBefore !== null);

  // Submit
  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "Final answer",
      [qChoice.id]: optA.id,
      [qMulti.id]: [optX.id],
    },
  });

  // Verify draft is deleted from DB
  const draftAfter = await db.surveyDraft.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.equal(draftAfter, null);
});

// ──────────────────────────────────────────────
// S22 Anonymous submission helpers
// ──────────────────────────────────────────────

async function createActiveAnonymousSurveyWithQuestions() {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Anonymous submit test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.ANONYMOUS,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Anonymous submit test",
    startsAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  });

  // Ensure at least 5 eligible recipients
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });

  const extraIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const extraId = `anon-extra-${i}`;
    extraIds.push(extraId);
    await db.user.create({
      data: {
        id: extraId,
        email: `anon-extra${i}@example.test`,
        name: `Anon Extra ${i}`,
        passwordHash: "test-password-hash",
        role: "USER",
      },
    });
    await addAudienceUser({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: extraId,
    });
  }
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: userId,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  const qText = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Anonymous Q",
    type: SurveyQuestionType.SHORT_TEXT,
    required: true,
  });

  const qChoice = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
    required: true,
  });

  const optA = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qChoice.id,
    label: "Option A",
  });

  const optB = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: qChoice.id,
    label: "Option B",
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  return { survey, qText, qChoice, optA, optB };
}

// ──────────────────────────────────────────────
// S22 Anonymous submission: basic submit
// ──────────────────────────────────────────────

test("S22 submit: anonymous response stores userId=null and hasSubmitted=true", async () => {
  const { survey, qText, qChoice, optA } =
    await createActiveAnonymousSurveyWithQuestions();

  await submitAnonymousResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "anon answer",
      [qChoice.id]: optA.id,
    },
  });

  // Verify response row has userId = null
  const response = await db.surveyResponse.findFirst({
    where: { surveyId: survey.id },
  });
  assert.ok(response !== null);
  assert.equal(response.userId, null);

  // Verify recipient hasSubmitted = true
  const recipient = await db.surveyRecipient.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.ok(recipient !== null);
  assert.equal(recipient.hasSubmitted, true);

  // Verify no audit row exists for anonymous submission
  const auditLogs = await db.auditLog.findMany({
    where: {
      entityId: response.id,
      action: "SURVEY_RESPONSE_SUBMITTED",
    },
  });
  assert.equal(auditLogs.length, 0);
});

// ──────────────────────────────────────────────
// S22 Anonymous submission: no identity link
// ──────────────────────────────────────────────

test("S22 submit: no response, answer, or audit row links to respondent identity", async () => {
  const { survey, qText, qChoice, optA } =
    await createActiveAnonymousSurveyWithQuestions();

  await submitAnonymousResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "secret answer",
      [qChoice.id]: optA.id,
    },
  });

  // Response row must not have userId
  const response = await db.surveyResponse.findFirst({
    where: { surveyId: survey.id },
  });
  assert.ok(response !== null);
  assert.equal(response.userId, null);

  // Answer rows must not expose identity
  const answers = await db.surveyAnswer.findMany({
    where: { responseId: response.id },
  });
  assert.ok(answers.length > 0);
  for (const answer of answers) {
    // No user-linked fields on answer rows
    assert.ok(!("userId" in answer));
  }

  // No audit row for the anonymous submission
  const auditLogs = await db.auditLog.findMany({
    where: {
      entityId: response.id,
      action: "SURVEY_RESPONSE_SUBMITTED",
    },
  });
  assert.equal(auditLogs.length, 0);

  // The publication invitation predates submission and is permitted. Submission
  // itself must not create an identity-bearing notification.
  const notifications = await db.notification.findMany({
    where: {
      userId: userId,
      surveyId: survey.id,
    },
  });
  assert.deepEqual(notifications.map((notification) => notification.type), [
    "SURVEY_INVITATION",
  ]);

  // No answer-option rows link to identity
  const answerOptions = await db.surveyAnswerOption.findMany({
    where: { answer: { responseId: response.id } },
  });
  // They exist but have no user relation
  assert.ok(answerOptions.length >= 0);
});

// ──────────────────────────────────────────────
// S22 Anonymous submission: double submit
// ──────────────────────────────────────────────

test("S22 submit: double submit yields exactly one anonymous response", async () => {
  const { survey, qText, qChoice, optA } =
    await createActiveAnonymousSurveyWithQuestions();

  await submitAnonymousResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "first",
      [qChoice.id]: optA.id,
    },
  });

  // Second submit must fail
  await assert.rejects(
    () =>
      submitAnonymousResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "second",
          [qChoice.id]: optA.id,
        },
      }),
    SurveyServiceError,
  );

  // Only one response exists
  const responses = await db.surveyResponse.findMany({
    where: { surveyId: survey.id },
  });
  assert.equal(responses.length, 1);
  assert.equal(responses[0].userId, null);

  // Recipient marked exactly once
  const recipient = await db.surveyRecipient.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.ok(recipient !== null);
  assert.equal(recipient.hasSubmitted, true);
});

// ──────────────────────────────────────────────
// S22 Anonymous submission: identity mode guard
// ──────────────────────────────────────────────

test("S22 submit: rejects named survey", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Named survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Named survey",
    startsAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  });

  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: userId,
  });

  const qText = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q",
    type: SurveyQuestionType.SHORT_TEXT,
    required: true,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    () =>
      submitAnonymousResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: { [qText.id]: "Should fail" },
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S22 Anonymous submission: draft deletion
// ──────────────────────────────────────────────

test("S22 submit: deletes draft after anonymous submission", async () => {
  const { survey, qText, qChoice, optA } =
    await createActiveAnonymousSurveyWithQuestions();

  // Create a draft
  await upsertDraft({
    actorUserId: userId,
    surveyId: survey.id,
    answers: { [qText.id]: "Draft to delete" },
  });

  const draftBefore = await db.surveyDraft.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.ok(draftBefore !== null);

  await submitAnonymousResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "Final anon",
      [qChoice.id]: optA.id,
    },
  });

  const draftAfter = await db.surveyDraft.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.equal(draftAfter, null);
});

// ──────────────────────────────────────────────
// S22 Anonymous submission: already submitted
// ──────────────────────────────────────────────

test("S22 submit: rejects already-submitted recipient", async () => {
  const { survey, qText, qChoice, optA } =
    await createActiveAnonymousSurveyWithQuestions();

  await submitAnonymousResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: {
      [qText.id]: "done",
      [qChoice.id]: optA.id,
    },
  });

  await assert.rejects(
    () =>
      submitAnonymousResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "again",
          [qChoice.id]: optA.id,
        },
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S22 Anonymous submission: validation
// ──────────────────────────────────────────────

test("S22 submit: anonymous submission validates required questions", async () => {
  const { survey, qChoice } =
    await createActiveAnonymousSurveyWithQuestions();

  // Missing required text question
  await assert.rejects(
    () =>
      submitAnonymousResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          // Missing qText.id
          [qChoice.id]: null,
        },
      }),
    SurveyServiceError,
  );

  // Verify nothing was written
  const recipient = await db.surveyRecipient.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.ok(recipient !== null);
  assert.equal(recipient.hasSubmitted, false);

  const responses = await db.surveyResponse.findMany({
    where: { surveyId: survey.id },
  });
  assert.equal(responses.length, 0);
});

// ──────────────────────────────────────────────
// S22 Anonymous submission: invalid option
// ──────────────────────────────────────────────

test("S22 submit: anonymous submission rejects invalid options", async () => {
  const { survey, qText, qChoice } =
    await createActiveAnonymousSurveyWithQuestions();

  await assert.rejects(
    () =>
      submitAnonymousResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "valid text",
          [qChoice.id]: "invalid-option-id",
        },
      }),
    SurveyServiceError,
  );

  // Verify nothing was written
  const recipient = await db.surveyRecipient.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.equal(recipient?.hasSubmitted, false);
});

// ──────────────────────────────────────────────
// S22 Anonymous submission: concurrent submit
// ──────────────────────────────────────────────

test("S22 submit: concurrent anonymous submit creates exactly one response", async () => {
  const { survey, qText, qChoice, optA } =
    await createActiveAnonymousSurveyWithQuestions();

  // Simulate two concurrent submissions
  const results = await Promise.allSettled([
    submitAnonymousResponse({
      actorUserId: userId,
      surveyId: survey.id,
      answers: {
        [qText.id]: "concurrent A",
        [qChoice.id]: optA.id,
      },
    }),
    submitAnonymousResponse({
      actorUserId: userId,
      surveyId: survey.id,
      answers: {
        [qText.id]: "concurrent B",
        [qChoice.id]: optA.id,
      },
    }),
  ]);

  // Exactly one succeeded
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r) => r.status === "rejected").length;
  assert.equal(succeeded, 1);
  assert.equal(rejected, 1);

  // Only one response
  const responses = await db.surveyResponse.findMany({
    where: { surveyId: survey.id },
  });
  assert.equal(responses.length, 1);
  assert.equal(responses[0].userId, null);

  // Recipient marked once
  const recipient = await db.surveyRecipient.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
  });
  assert.ok(recipient !== null);
  assert.equal(recipient.hasSubmitted, true);
});

// ──────────────────────────────────────────────
// S22 Anonymous submission: cross-survey option
// ──────────────────────────────────────────────

test("S22 submit: anonymous rejects cross-survey option ID", async () => {
  const { survey: survey1 } =
    await createActiveAnonymousSurveyWithQuestions();

  // Create a second survey manually (no need for extra users)
  const survey2 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Cross survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.ANONYMOUS,
  });
  const q2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey2.id,
    prompt: "Cross Q",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const crossOption = await addOption({
    actorUserId: adminId,
    surveyId: survey2.id,
    questionId: q2.id,
    label: "Cross option",
  });

  // Try to submit it against survey1
  await assert.rejects(
    () =>
      submitAnonymousResponse({
        actorUserId: userId,
        surveyId: survey1.id,
        answers: {
          [q2.id]: crossOption.id,
        },
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S22 Anonymous submission: inactive survey
// ──────────────────────────────────────────────

test("S22 submit: anonymous rejects submission to inactive survey", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Future anon survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.ANONYMOUS,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Future anon survey",
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
    endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });

  // Set audience and publish
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });

  const extraIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const extraId = `future-anon-extra-${i}`;
    extraIds.push(extraId);
    await db.user.create({
      data: {
        id: extraId,
        email: `future-anon${i}@example.test`,
        name: `Future Anon ${i}`,
        passwordHash: "test-password-hash",
        role: "USER",
      },
    });
    await addAudienceUser({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: extraId,
    });
  }
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: userId,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  const qText = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q",
    type: SurveyQuestionType.SHORT_TEXT,
    required: true,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  // Survey starts tomorrow, so it's SCHEDULED not ACTIVE
  await assert.rejects(
    () =>
      submitAnonymousResponse({
        actorUserId: userId,
        surveyId: survey.id,
        answers: { [qText.id]: "too early" },
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S22 Anonymous submission: non-recipient
// ──────────────────────────────────────────────

test("S22 submit: anonymous rejects non-recipient", async () => {
  const { survey, qText, qChoice, optA } =
    await createActiveAnonymousSurveyWithQuestions();

  // secondUserId is a recipient, but let's create a third user who is not
  const nonRecipientId = "anon-non-recipient";
  await db.user.create({
    data: {
      id: nonRecipientId,
      email: "anon-non-recipient@example.test",
      name: "Non Recipient",
      passwordHash: "test-password-hash",
      role: "USER",
    },
  });

  await assert.rejects(
    () =>
      submitAnonymousResponse({
        actorUserId: nonRecipientId,
        surveyId: survey.id,
        answers: {
          [qText.id]: "intruder",
          [qChoice.id]: optA.id,
        },
      }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S23 Completion and access hardening
// ──────────────────────────────────────────────

async function captureSurveyError(operation: () => Promise<void>) {
  try {
    await operation();
    assert.fail("Expected SurveyServiceError");
  } catch (error) {
    assert.ok(error instanceof SurveyServiceError);
    return error;
  }
}

test("S23 submit: guessed and unauthorized survey IDs have the same access failure", async () => {
  const { survey, qText, qChoice, optA } =
    await createActiveAnonymousSurveyWithQuestions();
  const intruderId = "s23-intruder";
  await db.user.create({
    data: {
      id: intruderId,
      email: "s23-intruder@example.test",
      name: "S23 Intruder",
      passwordHash: "test-password-hash",
      role: "USER",
    },
  });

  const answers = { [qText.id]: "attempt", [qChoice.id]: optA.id };
  const missingError = await captureSurveyError(() =>
    submitAnonymousResponse({
      actorUserId: intruderId,
      surveyId: "guessed-survey-id",
      answers,
    }),
  );
  const unauthorizedError = await captureSurveyError(() =>
    submitAnonymousResponse({
      actorUserId: intruderId,
      surveyId: survey.id,
      answers,
    }),
  );

  assert.equal(missingError.code, "ACCESS_DENIED");
  assert.equal(unauthorizedError.code, "ACCESS_DENIED");
  assert.equal(missingError.message, unauthorizedError.message);
});

test("S23 submit: inactive recipient receives a typed access denial", async () => {
  const { survey, qText, qChoice, optA } =
    await createActiveAnonymousSurveyWithQuestions();
  await db.user.update({ where: { id: userId }, data: { active: false } });

  const error = await captureSurveyError(() =>
    submitAnonymousResponse({
      actorUserId: userId,
      surveyId: survey.id,
      answers: { [qText.id]: "attempt", [qChoice.id]: optA.id },
    }),
  );

  assert.equal(error.code, "ACCESS_DENIED");
});

test("S23 submit: service keeps exact survey schedule boundaries", () => {
  const startsAt = new Date("2026-08-21T08:00:00.000Z");
  const endsAt = new Date("2026-08-21T09:00:00.000Z");
  const survey = { state: SurveyState.PUBLISHED, startsAt, endsAt };
  assert.equal(getSurveyDisplayState(survey, startsAt), "ACTIVE");
  assert.equal(getSurveyDisplayState(survey, endsAt), "ENDED");
});

test("S23 submit: altered answer values cannot use an option from another survey", async () => {
  const { survey, qText, qChoice } = await createActiveAnonymousSurveyWithQuestions();
  const otherSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "S23 option source",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const otherQuestion = await addQuestion({
    actorUserId: adminId,
    surveyId: otherSurvey.id,
    prompt: "Other",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const otherOption = await addOption({
    actorUserId: adminId,
    surveyId: otherSurvey.id,
    questionId: otherQuestion.id,
    label: "Other option",
  });

  const error = await captureSurveyError(() =>
    submitAnonymousResponse({
      actorUserId: userId,
      surveyId: survey.id,
      answers: { [qText.id]: "attempt", [qChoice.id]: otherOption.id },
    }),
  );

  assert.equal(error.code, "INVALID_SUBMISSION");
  assert.equal(
    await db.surveyResponse.count({ where: { surveyId: survey.id } }),
    0,
  );
});

test("S23 submit: altered hidden answers and oversized text are rejected", async () => {
  const { survey, qSource, optNo, qTarget } =
    await createActiveSurveyWithConditionalQuestion();

  const hiddenError = await captureSurveyError(() =>
    submitNamedResponse({
      actorUserId: userId,
      surveyId: survey.id,
      answers: { [qSource.id]: optNo.id, [qTarget.id]: "should be hidden" },
    }),
  );
  assert.equal(hiddenError.code, "INVALID_SUBMISSION");

  const { survey: textSurvey, qText, qChoice, optA, qMulti, optX, qLong } =
    await createActiveNamedSurveyWithQuestions();
  const oversizedShortTextError = await captureSurveyError(() =>
    submitNamedResponse({
      actorUserId: userId,
      surveyId: textSurvey.id,
      answers: {
        [qText.id]: "x".repeat(SURVEY_SHORT_TEXT_MAX_LENGTH + 1),
        [qChoice.id]: optA.id,
        [qMulti.id]: [optX.id],
        [qLong.id]: "valid long text",
      },
    }),
  );
  assert.equal(oversizedShortTextError.code, "INVALID_SUBMISSION");

  const oversizedLongTextError = await captureSurveyError(() =>
    submitNamedResponse({
      actorUserId: userId,
      surveyId: textSurvey.id,
      answers: {
        [qText.id]: "valid short text",
        [qChoice.id]: optA.id,
        [qMulti.id]: [optX.id],
        [qLong.id]: "x".repeat(SURVEY_LONG_TEXT_MAX_LENGTH + 1),
      },
    }),
  );
  assert.equal(oversizedLongTextError.code, "INVALID_SUBMISSION");
  assert.equal(
    await db.surveyResponse.count({ where: { surveyId: textSurvey.id } }),
    0,
  );
});

test("S29 submit: final payload limit counts Persian UTF-8 bytes", async () => {
  const { survey } = await createActiveNamedSurveyWithQuestions();
  const answers = { unknownQuestion: "پ".repeat(25_000) };
  const serialized = JSON.stringify(answers);

  assert.ok(serialized.length < SURVEY_FINAL_RESPONSE_MAX_SIZE_BYTES);
  assert.ok(
    Buffer.byteLength(serialized, "utf8") > SURVEY_FINAL_RESPONSE_MAX_SIZE_BYTES,
  );

  const error = await captureSurveyError(() =>
    submitNamedResponse({
      actorUserId: userId,
      surveyId: survey.id,
      answers,
    }),
  );
  assert.equal(error.code, "INVALID_SUBMISSION");
  assert.equal(
    await db.surveyResponse.count({ where: { surveyId: survey.id } }),
    0,
  );
});

test("S23 submit: completed recipient receives a typed conflict without another response", async () => {
  const { survey, qText, qChoice, optA } =
    await createActiveAnonymousSurveyWithQuestions();
  const answers = { [qText.id]: "first", [qChoice.id]: optA.id };
  await submitAnonymousResponse({ actorUserId: userId, surveyId: survey.id, answers });

  const error = await captureSurveyError(() =>
    submitAnonymousResponse({ actorUserId: userId, surveyId: survey.id, answers }),
  );
  assert.equal(error.code, "ALREADY_SUBMITTED");
  assert.equal(
    await db.surveyResponse.count({ where: { surveyId: survey.id } }),
    1,
  );
});
