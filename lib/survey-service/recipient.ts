import "server-only";

import { db } from "@/lib/db";
import { canParticipate, isSurveyManager } from "@/lib/survey-permissions";
import {
  loadActiveActorUser,
  resolveSurveyActor,
  SurveyServiceError,
} from "@/lib/survey-service/shared";
import { getSurveyDisplayState } from "@/lib/survey-status";
import type { SurveyDisplayState } from "@/lib/survey-status";
import type { SurveyKind, SurveyIdentityMode, SurveyQuestionType } from "@prisma/client";

export type RecipientSurveyData = {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  actorUserId: string;
  isCollaborator: boolean;
  isRecipient: boolean;
  kind: SurveyKind;
  identityMode: SurveyIdentityMode;
  displayState: SurveyDisplayState;
  hasSubmitted: boolean;
  canParticipate: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  publishedAt: Date | null;
  questions: Array<{
    id: string;
    prompt: string;
    helpText: string | null;
    type: SurveyQuestionType;
    required: boolean;
    sortOrder: number;
    randomizeOptions: boolean;
    ratingMin: number | null;
    ratingMax: number | null;
    ratingMinLabel: string | null;
    ratingMaxLabel: string | null;
    maxSelections: number | null;
    condition: { sourceQuestionId: string; sourceOptionId: string; operator: string } | null;
    options: Array<{
      id: string;
      label: string;
      sortOrder: number;
    }>;
  }>;
  participationCount: number | null;
};

/**
 * Loads survey data for a recipient-facing page.
 *
 * Authorization:
 * - The actor must be a recipient of the survey, OR have management access
 *   (owner, collaborator, or admin).
 * - Non-recipients without management access get a not-found error.
 *
 * Privacy:
 * - `participationCount` is returned only for managers (owner/collaborator/admin).
 * - For ordinary recipients, `participationCount` is null.
 */
export async function getSurveyForRecipient(
  surveyId: string,
  actorUserId: string,
): Promise<RecipientSurveyData> {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: surveyId },
      select: {
        id: true,
        title: true,
        description: true,
        kind: true,
        identityMode: true,
        state: true,
        startsAt: true,
        endsAt: true,
        publishedAt: true,
        ownerId: true,
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

    const isManager = isSurveyManager(actor);
    const isRecipient = actor.isRecipient;

    // Non-recipients without management access cannot see the survey
    if (!isRecipient && !isManager) {
      throw new SurveyServiceError("Survey was not found.");
    }

    // Load recipient submission status for the actor
    const recipient = await tx.surveyRecipient.findUnique({
      where: { surveyId_userId: { surveyId: survey.id, userId: actorUserId } },
      select: { hasSubmitted: true },
    });

    const hasSubmitted = recipient?.hasSubmitted ?? false;

    // Load questions with conditions and options
    const rawQuestions = await tx.surveyQuestion.findMany({
      where: { surveyId: survey.id },
      select: {
        id: true,
        prompt: true,
        helpText: true,
        type: true,
        required: true,
        sortOrder: true,
        randomizeOptions: true,
        ratingMin: true,
        ratingMax: true,
        ratingMinLabel: true,
        ratingMaxLabel: true,
        maxSelections: true,
        targetCondition: {
          select: {
            sourceQuestionId: true,
            sourceOptionId: true,
            operator: true,
          },
        },
        options: {
          select: {
            id: true,
            label: true,
            sortOrder: true,
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

    const questions = rawQuestions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      helpText: q.helpText,
      type: q.type,
      required: q.required,
      sortOrder: q.sortOrder,
      randomizeOptions: q.randomizeOptions,
      ratingMin: q.ratingMin,
      ratingMax: q.ratingMax,
      ratingMinLabel: q.ratingMinLabel,
      ratingMaxLabel: q.ratingMaxLabel,
      maxSelections: q.maxSelections,
      condition: q.targetCondition
        ? {
            sourceQuestionId: q.targetCondition.sourceQuestionId,
            sourceOptionId: q.targetCondition.sourceOptionId,
            operator: q.targetCondition.operator,
          }
        : null,
      options: [...q.options].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      }),
    }));

    // Participation count: only for managers
    let participationCount: number | null = null;
    if (isManager) {
      participationCount = await tx.surveyRecipient.count({
        where: { surveyId: survey.id, hasSubmitted: true },
      });
    }

    const displayState = getSurveyDisplayState(survey, new Date());

    return {
      id: survey.id,
      title: survey.title,
      description: survey.description,
      ownerId: survey.ownerId,
      actorUserId,
      isCollaborator: actor.isCollaborator,
      isRecipient: actor.isRecipient,
      kind: survey.kind,
      identityMode: survey.identityMode,
      displayState,
      hasSubmitted,
      startsAt: survey.startsAt,
      endsAt: survey.endsAt,
      publishedAt: survey.publishedAt,
      canParticipate: canParticipate(actor, displayState),
      questions,
      participationCount,
    };
  });
}
