import "server-only";

import { db } from "@/lib/db";
import { isSurveyManager } from "@/lib/survey-permissions";
import {
  loadActiveActorUser,
  resolveSurveyActor,
  SurveyServiceError,
  type DbClient,
} from "@/lib/survey-service/shared";
import { getSurveyDisplayState } from "@/lib/survey-status";
import type { SurveyDisplayState } from "@/lib/survey-status";
import type { SurveyKind, SurveyIdentityMode } from "@prisma/client";

export type RecipientSurveyData = {
  id: string;
  title: string;
  description: string | null;
  kind: SurveyKind;
  identityMode: SurveyIdentityMode;
  displayState: SurveyDisplayState;
  hasSubmitted: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  publishedAt: Date | null;
  questions: Array<{
    id: string;
    prompt: string;
    helpText: string | null;
    type: string;
    required: boolean;
    sortOrder: number;
    randomizeOptions: boolean;
    ratingMin: number | null;
    ratingMax: number | null;
    ratingMinLabel: string | null;
    ratingMaxLabel: string | null;
    maxSelections: number | null;
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

    // Load questions with options
    const questions = await tx.surveyQuestion.findMany({
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
        options: {
          select: {
            id: true,
            label: true,
            sortOrder: true,
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

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
      kind: survey.kind,
      identityMode: survey.identityMode,
      displayState,
      hasSubmitted,
      startsAt: survey.startsAt,
      endsAt: survey.endsAt,
      publishedAt: survey.publishedAt,
      questions,
      participationCount,
    };
  });
}
