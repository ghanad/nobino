import "server-only";

import {
  SurveyQuestionType,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  SURVEY_FINAL_RESPONSE_MAX_SIZE_BYTES,
  SURVEY_LONG_TEXT_MAX_LENGTH,
  SURVEY_SHORT_TEXT_MAX_LENGTH,
} from "@/lib/survey-response-limits";
import { canParticipate } from "@/lib/survey-permissions";
import { getSurveyDisplayState } from "@/lib/survey-status";
import {
  SurveyServiceError,
  loadActiveActorUser,
  resolveSurveyActor,
  type DbClient,
} from "@/lib/survey-service/shared";
import {
  getVisibleQuestionIds,
  type AnswerValue,
} from "@/lib/survey-response-utils";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type SurveyWithFullQuestions = {
  id: string;
  state: string;
  ownerId: string;
  startsAt: Date | null;
  endsAt: Date | null;
  kind: string;
  identityMode: string;
  questions: Array<{
    id: string;
    type: string;
    required: boolean;
    sortOrder: number;
    ratingMin: number | null;
    ratingMax: number | null;
    maxSelections: number | null;
    targetCondition: {
      sourceQuestionId: string;
      sourceOptionId: string;
      operator: string;
    } | null;
    options: Array<{ id: string }>;
  }>;
};

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Atomically validate and store an immutable named response.
 *
 * Authorization:
 * - Actor must be an active recipient of the survey.
 * - Survey display state must be ACTIVE.
 * - Recipient must not have already submitted.
 *
 * Transaction guarantees:
 * - Conditional claim on SurveyRecipient.hasSubmitted = false prevents
 *   double submission.
 * - All writes (response, answers, draft deletion, audit) happen in one
 *   transaction so validation failure rolls back the claim.
 *
 * Privacy:
 * - Audit event is content-free (no answer bodies).
 * - Named responses store userId on the response row.
 */
export async function submitNamedResponse(input: {
  actorUserId: string;
  surveyId: string;
  answers: Record<string, unknown>;
}): Promise<void> {
  return submitResponseInternal(input.actorUserId, input.surveyId, input.answers, {
    identityMode: "NAMED",
  });
}

/**
 * Atomically validate and store an immutable anonymous response.
 *
 * Authorization:
 * - Actor must be an active recipient of the survey.
 * - Survey display state must be ACTIVE.
 * - Recipient must not have already submitted.
 *
 * Transaction guarantees:
 * - Conditional claim on SurveyRecipient.hasSubmitted = false prevents
 *   double submission.
 * - All writes (response, answers, draft deletion) happen in one
 *   transaction so validation failure rolls back the claim.
 *
 * Privacy:
 * - No audit event is created for anonymous submission.
 * - Response row has userId = null.
 * - Recipient stores only hasSubmitted = true; no completion timestamp.
 */
export async function submitAnonymousResponse(input: {
  actorUserId: string;
  surveyId: string;
  answers: Record<string, unknown>;
}): Promise<void> {
  return submitResponseInternal(input.actorUserId, input.surveyId, input.answers, {
    identityMode: "ANONYMOUS",
  });
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

type SubmitMode = {
  identityMode: "NAMED" | "ANONYMOUS";
};

/**
 * Shared submission pipeline for both named and anonymous responses.
 *
 * Named mode:
 * - Stores userId on the response row.
 * - Creates a content-free audit event.
 *
 * Anonymous mode:
 * - Stores userId = null on the response row.
 * - Does NOT create an audit event.
 */
async function submitResponseInternal(
  actorUserId: string,
  surveyId: string,
  rawAnswers: Record<string, unknown>,
  mode: SubmitMode,
): Promise<void> {
  let serializedAnswers: string;
  try {
    serializedAnswers = JSON.stringify(rawAnswers);
  } catch {
    throw new SurveyServiceError("داده‌های پاسخ نامعتبر است.");
  }

  if (
    Buffer.byteLength(serializedAnswers, "utf8") >
    SURVEY_FINAL_RESPONSE_MAX_SIZE_BYTES
  ) {
    throw new SurveyServiceError(
      "پاسخ نهایی بیش از حد بزرگ است.",
    );
  }

  return db.$transaction(async (tx) => {
    // 1. Load and authorize
    const { survey, recipient } = await loadAndAuthorize(
      tx,
      actorUserId,
      surveyId,
    );

    // 2. Guard: correct identity mode
    if (survey.identityMode !== mode.identityMode) {
      throw new SurveyServiceError(
        mode.identityMode === "NAMED"
          ? "این نظرسنجی نیاز به ارسال ناشناس دارد."
          : "این نظرسنجی نیاز به ارسال با نام دارد.",
      );
    }

    // 3. Compute visibility
    const visibilityQuestions = survey.questions.map((q) => ({
      id: q.id,
      type: q.type as
        | "SHORT_TEXT"
        | "LONG_TEXT"
        | "SINGLE_CHOICE"
        | "MULTIPLE_CHOICE"
        | "RATING",
      required: q.required,
      condition: q.targetCondition
        ? {
            sourceQuestionId: q.targetCondition.sourceQuestionId,
            sourceOptionId: q.targetCondition.sourceOptionId,
            operator: q.targetCondition.operator as
              | "IS_SELECTED"
              | "IS_NOT_SELECTED",
          }
        : null,
    }));

    const answers = rawAnswers as Record<string, AnswerValue>;
    const visibleIds = getVisibleQuestionIds(visibilityQuestions, answers);

    // 4. Validate answers
    validateSubmissionAnswers(survey, answers, visibleIds);

    // 5. Claim submission with conditional update
    const claimResult = await tx.surveyRecipient.updateMany({
      where: {
        surveyId: survey.id,
        userId: recipient.userId,
        hasSubmitted: false,
      },
      data: { hasSubmitted: true },
    });

    if (claimResult.count !== 1) {
      throw new SurveyServiceError(
        "You have already submitted this survey.",
        "ALREADY_SUBMITTED",
      );
    }

    // 6. Create the response
    const response = await tx.surveyResponse.create({
      data: {
        surveyId: survey.id,
        userId: mode.identityMode === "NAMED" ? actorUserId : null,
      },
    });

    // 7. Create normalized answers and answer options
    const questionMap = new Map(survey.questions.map((q) => [q.id, q]));

    for (const [questionId, value] of Object.entries(answers)) {
      if (!visibleIds.has(questionId)) continue;

      const question = questionMap.get(questionId);
      if (!question) continue;

      const answer = await tx.surveyAnswer.create({
        data: {
          responseId: response.id,
          questionId,
          textValue:
            question.type === SurveyQuestionType.SHORT_TEXT ||
            question.type === SurveyQuestionType.LONG_TEXT
              ? (value as string)
              : question.type === SurveyQuestionType.SINGLE_CHOICE
                ? (value as string)
                : null,
          numericValue:
            question.type === SurveyQuestionType.RATING
              ? (value as number)
              : null,
        },
      });

      // Create answer options for single/multiple choice
      if (
        question.type === SurveyQuestionType.SINGLE_CHOICE &&
        typeof value === "string"
      ) {
        await tx.surveyAnswerOption.create({
          data: {
            answerId: answer.id,
            optionId: value,
          },
        });
      } else if (
        question.type === SurveyQuestionType.MULTIPLE_CHOICE &&
        Array.isArray(value)
      ) {
        for (const optionId of value) {
          if (typeof optionId !== "string") continue;
          await tx.surveyAnswerOption.create({
            data: {
              answerId: answer.id,
              optionId,
            },
          });
        }
      }
    }

    // 8. Delete the linked draft
    await tx.surveyDraft.deleteMany({
      where: {
        surveyId: survey.id,
        userId: actorUserId,
      },
    });

    // 9. Create content-free audit event (named only)
    if (mode.identityMode === "NAMED") {
      await tx.auditLog.create({
        data: {
          action: "SURVEY_RESPONSE_SUBMITTED",
          entityType: "Survey",
          entityId: survey.id,
          actorUserId,
          newValue: { responseId: response.id },
        },
      });
    }
  });
}

/**
 * Load the survey and recipient, validating authorization.
 *
 * Authorization:
 * - Actor must be an active user.
 * - Survey must exist.
 * - Survey display state must be ACTIVE.
 * - Actor must be a recipient of the survey.
 * - Recipient must not have already submitted.
 */
async function loadAndAuthorize(
  tx: DbClient,
  actorUserId: string,
  surveyId: string,
): Promise<{
  survey: SurveyWithFullQuestions;
  recipient: { userId: string; hasSubmitted: boolean };
}> {
  const user = await loadActiveActorUser(actorUserId, tx);

  const survey = await tx.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      state: true,
      ownerId: true,
      startsAt: true,
      endsAt: true,
      kind: true,
      identityMode: true,
      questions: {
        select: {
          id: true,
          type: true,
          required: true,
          sortOrder: true,
          ratingMin: true,
          ratingMax: true,
          maxSelections: true,
          targetCondition: {
            select: {
              sourceQuestionId: true,
              sourceOptionId: true,
              operator: true,
            },
          },
          options: { select: { id: true } },
        },
      },
    },
  });

  if (!survey) {
    throw new SurveyServiceError("Survey access was denied.", "ACCESS_DENIED");
  }

  const actor = await resolveSurveyActor(tx, {
    actorUserId,
    surveyId: survey.id,
    ownerId: survey.ownerId,
    user,
  });

  const displayState = getSurveyDisplayState(survey, new Date());

  if (!canParticipate(actor, displayState)) {
    throw new SurveyServiceError(
      "Survey access was denied.",
      "ACCESS_DENIED",
    );
  }

  const recipient = await tx.surveyRecipient.findUnique({
    where: {
      surveyId_userId: {
        surveyId: survey.id,
        userId: actorUserId,
      },
    },
    select: { userId: true, hasSubmitted: true },
  });

  if (!recipient) {
    throw new SurveyServiceError(
      "Survey access was denied.",
      "ACCESS_DENIED",
    );
  }

  if (recipient.hasSubmitted) {
    throw new SurveyServiceError(
      "You have already submitted this survey.",
      "ALREADY_SUBMITTED",
    );
  }

  return { survey, recipient };
}

/**
 * Validate submission answers against the survey's questions and visibility.
 *
 * Rules:
 * - Every answer must be for a visible question in this survey.
 * - Every visible required question must have a valid, non-null answer.
 * - Optional questions may be null/undefined.
 * - Values must be valid for the question type.
 */
function validateSubmissionAnswers(
  survey: SurveyWithFullQuestions,
  answers: Record<string, AnswerValue>,
  visibleIds: Set<string>,
): void {
  const questionMap = new Map(survey.questions.map((q) => [q.id, q]));

  // Reject answers for non-visible or unknown questions
  for (const questionId of Object.keys(answers)) {
    if (!visibleIds.has(questionId)) {
      throw new SurveyServiceError(
        `سوال "${questionId}" در این نظرسنجی در دسترس نیست.`,
      );
    }

    const question = questionMap.get(questionId);
    if (!question) {
      throw new SurveyServiceError(
        `شناسه سوال "${questionId}" در این نظرسنجی وجود ندارد.`,
      );
    }
  }

  // Validate each visible question
  for (const question of survey.questions) {
    if (!visibleIds.has(question.id)) continue;

    const value = answers[question.id];
    const isAnswered = value !== null && value !== undefined;

    if (question.required && !isAnswered) {
      throw new SurveyServiceError(
        `پاسخ به سوال "${question.id}" الزامی است.`,
      );
    }

    if (!isAnswered) continue;

    validateAnswerValue(question, value);
  }
}

function validateAnswerValue(
  question: SurveyWithFullQuestions["questions"][number],
  value: AnswerValue,
): void {
  switch (question.type) {
    case SurveyQuestionType.SHORT_TEXT:
    case SurveyQuestionType.LONG_TEXT: {
      if (typeof value !== "string") {
        throw new SurveyServiceError(
          `مقدار سوال "${question.id}" باید متن باشد.`,
        );
      }
      if (question.required && value.trim().length === 0) {
        throw new SurveyServiceError(
          `پاسخ به سوال "${question.id}" نمی‌تواند خالی باشد.`,
        );
      }
      const maximumLength = question.type === SurveyQuestionType.SHORT_TEXT
        ? SURVEY_SHORT_TEXT_MAX_LENGTH
        : SURVEY_LONG_TEXT_MAX_LENGTH;
      if (value.length > maximumLength) {
        throw new SurveyServiceError(
          `پاسخ سوال "${question.id}" بیش از حد مجاز است.`,
        );
      }
      break;
    }

    case SurveyQuestionType.SINGLE_CHOICE: {
      if (typeof value !== "string") {
        throw new SurveyServiceError(
          `مقدار سوال "${question.id}" باید یک گزینه باشد.`,
        );
      }
      const validOptionIds = new Set(question.options.map((o) => o.id));
      if (!validOptionIds.has(value)) {
        throw new SurveyServiceError(
          `گزینه "${value}" برای سوال "${question.id}" معتبر نیست.`,
        );
      }
      break;
    }

    case SurveyQuestionType.MULTIPLE_CHOICE: {
      if (!Array.isArray(value)) {
        throw new SurveyServiceError(
          `مقدار سوال "${question.id}" باید آرایه‌ای از گزینه‌ها باشد.`,
        );
      }
      const validOptionIds = new Set(question.options.map((o) => o.id));
      if (new Set(value).size !== value.length) {
        throw new SurveyServiceError(
          `گزینه‌های سوال "${question.id}" نباید تکراری باشند.`,
        );
      }
      for (const optionId of value) {
        if (typeof optionId !== "string" || !validOptionIds.has(optionId)) {
          throw new SurveyServiceError(
            `گزینه "${optionId}" برای سوال "${question.id}" معتبر نیست.`,
          );
        }
      }
      if (question.required && value.length === 0) {
        throw new SurveyServiceError(
          `حداقل یک گزینه برای سوال "${question.id}" باید انتخاب شود.`,
        );
      }
      if (
        question.maxSelections !== null &&
        question.maxSelections !== undefined &&
        value.length > question.maxSelections
      ) {
        throw new SurveyServiceError(
          `حداکثر ${question.maxSelections} گزینه برای سوال "${question.id}" مجاز است.`,
        );
      }
      break;
    }

    case SurveyQuestionType.RATING: {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new SurveyServiceError(
          `مقدار سوال "${question.id}" باید یک عدد باشد.`,
        );
      }
      if (!Number.isInteger(value)) {
        throw new SurveyServiceError(
          `امتیاز سوال "${question.id}" باید یک عدد صحیح باشد.`,
        );
      }
      const min = question.ratingMin ?? 1;
      const max = question.ratingMax ?? 5;
      if (value < min || value > max) {
        throw new SurveyServiceError(
          `امتیاز سوال "${question.id}" باید بین ${min} و ${max} باشد.`,
        );
      }
      break;
    }

    default:
      throw new SurveyServiceError(
        `نوع سوال "${question.type}" پشتیبانی نمی‌شود.`,
      );
  }
}
