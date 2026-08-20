import "server-only";

import { SurveyQuestionType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { getSurveyDisplayState } from "@/lib/survey-status";
import { canParticipate } from "@/lib/survey-permissions";
import {
  SurveyServiceError,
  loadActiveActorUser,
  resolveSurveyActor,
  type DbClient,
} from "@/lib/survey-service/shared";

/** Maximum JSON payload size for a draft (50 KB). */
const MAX_DRAFT_SIZE_BYTES = 50_000;

/**
 * Load the current draft for a user, or null if none exists.
 *
 * Authorization:
 * - User must be an active recipient of the survey.
 * - Survey must be in ACTIVE display state.
 * - User must not have already submitted.
 *
 * Privacy: drafts are always user-linked, even for anonymous surveys.
 */
export async function loadDraft(input: {
  actorUserId: string;
  surveyId: string;
}): Promise<Record<string, unknown> | null> {
  return db.$transaction(async (tx) => {
    await assertCanAccessDraft(tx, input.actorUserId, input.surveyId);

    const draft = await tx.surveyDraft.findUnique({
      where: {
        surveyId_userId: {
          surveyId: input.surveyId,
          userId: input.actorUserId,
        },
      },
      select: { answers: true },
    });

    return draft ? (draft.answers as Record<string, unknown>) : null;
  });
}

/**
 * Create or update a draft.
 *
 * Authorization: same as loadDraft.
 *
 * Validation:
 * - Accepts incomplete answers (not all questions answered).
 * - Rejects answer keys that are not valid question IDs for the survey.
 * - Rejects choice answer values that are not valid option IDs for the question.
 * - Rejects wrong value types (e.g. string for MULTIPLE_CHOICE).
 * - Enforces a maximum JSON payload size.
 *
 * Does not log draft content.
 */
export async function upsertDraft(input: {
  actorUserId: string;
  surveyId: string;
  answers: Record<string, unknown>;
}): Promise<void> {
  // Size-limit before touching the database
  const rawJson = JSON.stringify(input.answers);
  if (rawJson.length > MAX_DRAFT_SIZE_BYTES) {
    throw new SurveyServiceError("پاسخ پیش‌نویس بیش از حد بزرگ است.");
  }

  await db.$transaction(async (tx) => {
    const survey = await assertCanAccessDraft(tx, input.actorUserId, input.surveyId);

    // Validate answer structure against survey questions
    validateDraftAnswers(tx, survey.id, input.answers, survey.questions);

    // Upsert the draft
    await tx.surveyDraft.upsert({
      where: {
        surveyId_userId: {
          surveyId: input.surveyId,
          userId: input.actorUserId,
        },
      },
      update: {
        answers: input.answers as Prisma.InputJsonValue,
      },
      create: {
        surveyId: input.surveyId,
        userId: input.actorUserId,
        answers: input.answers as Prisma.InputJsonValue,
      },
    });
  });
}

/**
 * Delete a draft.
 *
 * Authorization: same as loadDraft.
 */
export async function deleteDraft(input: {
  actorUserId: string;
  surveyId: string;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    await assertCanAccessDraft(tx, input.actorUserId, input.surveyId);

    await tx.surveyDraft.deleteMany({
      where: {
        surveyId: input.surveyId,
        userId: input.actorUserId,
      },
    });
  });
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

type SurveyWithQuestions = {
  id: string;
  state: string;
  ownerId: string;
  startsAt: Date | null;
  endsAt: Date | null;
  questions: Array<{
    id: string;
    type: string;
    options: Array<{ id: string }>;
  }>;
};

/**
 * Assert that the actor can access the draft:
 * - User is active and a recipient of the survey.
 * - Survey display state is ACTIVE.
 * - User has not already submitted.
 *
 * Returns the survey with questions and options for subsequent validation.
 */
async function assertCanAccessDraft(
  tx: DbClient,
  actorUserId: string,
  surveyId: string,
): Promise<SurveyWithQuestions> {
  const user = await loadActiveActorUser(actorUserId, tx);

  const survey = await tx.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      state: true,
      ownerId: true,
      startsAt: true,
      endsAt: true,
      questions: {
        select: {
          id: true,
          type: true,
          options: { select: { id: true } },
        },
      },
    },
  });

  if (!survey) {
    throw new SurveyServiceError("Survey was not found.");
  }

  const actor = await resolveSurveyActor(tx, {
    actorUserId,
    surveyId: survey.id,
    ownerId: survey.ownerId,
    user,
  });

  if (!canParticipate(actor, getSurveyDisplayState(survey, new Date()))) {
    throw new SurveyServiceError("You cannot access drafts for this survey.");
  }

  // Check submitted status
  const recipient = await tx.surveyRecipient.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId: actorUserId } },
    select: { hasSubmitted: true },
  });

  if (recipient?.hasSubmitted) {
    throw new SurveyServiceError("You have already submitted this survey.");
  }

  return survey;
}

/**
 * Validate draft answers against the survey's questions and options.
 *
 * Accepts incomplete answers (not all questions answered).
 * Rejects unknown question IDs, unknown option IDs, and wrong value types.
 */
function validateDraftAnswers(
  _tx: DbClient,
  _surveyId: string,
  answers: Record<string, unknown>,
  questions: SurveyWithQuestions["questions"],
): void {
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  for (const [questionId, value] of Object.entries(answers)) {
    const question = questionMap.get(questionId);

    if (!question) {
      throw new SurveyServiceError(
        `شناسه سوال "${questionId}" در این نظرسنجی وجود ندارد.`,
      );
    }

    // null is always acceptable (no answer yet)
    if (value === null || value === undefined) {
      continue;
    }

    switch (question.type) {
      case SurveyQuestionType.SHORT_TEXT:
      case SurveyQuestionType.LONG_TEXT:
        if (typeof value !== "string") {
          throw new SurveyServiceError(
            `مقدار سوال "${questionId}" باید متن باشد.`,
          );
        }
        break;

      case SurveyQuestionType.SINGLE_CHOICE: {
        if (typeof value !== "string") {
          throw new SurveyServiceError(
            `مقدار سوال "${questionId}" باید یک گزینه باشد.`,
          );
        }
        const validOptionIds = new Set(question.options.map((o) => o.id));
        if (!validOptionIds.has(value)) {
          throw new SurveyServiceError(
            `گزینه "${value}" برای سوال "${questionId}" معتبر نیست.`,
          );
        }
        break;
      }

      case SurveyQuestionType.MULTIPLE_CHOICE: {
        if (!Array.isArray(value)) {
          throw new SurveyServiceError(
            `مقدار سوال "${questionId}" باید آرایه‌ای از گزینه‌ها باشد.`,
          );
        }
        const validOptionIds = new Set(question.options.map((o) => o.id));
        for (const optionId of value) {
          if (typeof optionId !== "string" || !validOptionIds.has(optionId)) {
            throw new SurveyServiceError(
              `گزینه "${optionId}" برای سوال "${questionId}" معتبر نیست.`,
            );
          }
        }
        break;
      }

      case SurveyQuestionType.RATING:
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new SurveyServiceError(
            `مقدار سوال "${questionId}" باید یک عدد باشد.`,
          );
        }
        break;

      default:
        throw new SurveyServiceError(
          `نوع سوال "${question.type}" پشتیبانی نمی‌شود.`,
        );
    }
  }
}
