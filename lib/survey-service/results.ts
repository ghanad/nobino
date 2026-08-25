import "server-only";

import {
  SurveyIdentityMode,
  SurveyKind,
  SurveyQuestionType,
} from "@prisma/client";

import { db } from "@/lib/db";
import { canViewSurveyResults } from "@/lib/survey-permissions";
import {
  loadActiveActorUser,
  resolveSurveyActor,
  SurveyServiceError,
  type DbClient,
} from "@/lib/survey-service/shared";
import { getSurveyDisplayState, type SurveyDisplayState } from "@/lib/survey-status";

export type SurveyParticipationTotals = {
  recipientCount: number;
  submittedCount: number;
  responseRate: number | null;
};

type SurveyResultBase = {
  survey: {
    id: string;
    title: string;
    kind: SurveyKind;
    identityMode: SurveyIdentityMode;
    displayState: SurveyDisplayState;
  };
  participation: SurveyParticipationTotals;
};

export type SurveyResultsEmbargoed = SurveyResultBase & {
  availability: "VOTE_EMBARGO";
};

export type SurveyResultsPrivacyThreshold = SurveyResultBase & {
  availability: "ANONYMOUS_PRIVACY_THRESHOLD";
};

export type SurveyResultsAvailable = SurveyResultBase & {
  availability: "AVAILABLE";
  questions: Array<{
    id: string;
    prompt: string;
    type: SurveyQuestionType;
    choices: Array<{ id: string; label: string; count: number }> | null;
    rating: {
      min: number;
      max: number;
      minLabel: string | null;
      maxLabel: string | null;
      distribution: Array<{ value: number; count: number }>;
      average: number | null;
    } | null;
    textAnswers: Array<
      | { text: string }
      | {
          text: string;
          responseId: string;
          submittedAt: Date;
          respondent: { id: string; name: string; email: string } | null;
        }
    >;
  }>;
};

export type SurveyResults =
  | SurveyResultsEmbargoed
  | SurveyResultsPrivacyThreshold
  | SurveyResultsAvailable;

export type SurveyResultAccess = SurveyResultBase & {
  availability:
    | "AVAILABLE"
    | "VOTE_EMBARGO"
    | "ANONYMOUS_PRIVACY_THRESHOLD";
};

/**
 * Applies the single result authorization and disclosure decision used by
 * result readers. Callers must not infer access from UI visibility alone.
 */
export async function getSurveyResultAccess(input: {
  actorUserId: string;
  surveyId: string;
}): Promise<SurveyResultAccess> {
  return db.$transaction((tx) => loadSurveyResultAccess(tx, input));
}

/**
 * Returns survey results only when the shared disclosure decision permits it.
 * Vote embargoes and anonymous privacy thresholds deliberately apply to every
 * authorized viewer, including administrators.
 */
export async function getSurveyResults(input: {
  actorUserId: string;
  surveyId: string;
}): Promise<SurveyResults> {
  return db.$transaction(async (tx) => {
    const access = await loadSurveyResultAccess(tx, input);

    if (access.availability === "VOTE_EMBARGO") {
      return { ...access, availability: "VOTE_EMBARGO" };
    }

    if (access.availability === "ANONYMOUS_PRIVACY_THRESHOLD") {
      return { ...access, availability: "ANONYMOUS_PRIVACY_THRESHOLD" };
    }

    const questions = await tx.surveyQuestion.findMany({
      where: { surveyId: access.survey.id },
      select: {
        id: true,
        prompt: true,
        type: true,
        ratingMin: true,
        ratingMax: true,
        ratingMinLabel: true,
        ratingMaxLabel: true,
        options: { select: { id: true, label: true, sortOrder: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

    const answers = await tx.surveyAnswer.findMany({
      where: { question: { surveyId: access.survey.id } },
      select: {
        questionId: true,
        textValue: true,
        numericValue: true,
        selectedOptions: { select: { optionId: true } },
      },
    });

    const anonymous = access.survey.identityMode === SurveyIdentityMode.ANONYMOUS;
    const namedTextAnswers = anonymous
      ? []
      : await tx.surveyAnswer.findMany({
          where: {
            question: {
              surveyId: access.survey.id,
              type: { in: [SurveyQuestionType.SHORT_TEXT, SurveyQuestionType.LONG_TEXT] },
            },
            textValue: { not: null },
          },
          select: {
            questionId: true,
            textValue: true,
            response: {
              select: {
                id: true,
                submittedAt: true,
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
          orderBy: [{ response: { submittedAt: "asc" } }, { responseId: "asc" }],
        });

    const answersByQuestion = new Map<string, typeof answers>();
    for (const answer of answers) {
      const current = answersByQuestion.get(answer.questionId) ?? [];
      current.push(answer);
      answersByQuestion.set(answer.questionId, current);
    }

    const namedTextByQuestion = new Map<string, typeof namedTextAnswers>();
    for (const answer of namedTextAnswers) {
      const current = namedTextByQuestion.get(answer.questionId) ?? [];
      current.push(answer);
      namedTextByQuestion.set(answer.questionId, current);
    }

    return {
      ...access,
      availability: "AVAILABLE",
      questions: questions.map((question) => {
        const questionAnswers = answersByQuestion.get(question.id) ?? [];
        const choices = isChoiceQuestion(question.type)
          ? [...question.options]
              .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
              .map((option) => ({
                id: option.id,
                label: option.label,
                count: questionAnswers.reduce(
                  (count, answer) =>
                    count + answer.selectedOptions.filter((selected) => selected.optionId === option.id).length,
                  0,
                ),
              }))
          : null;
        const rating = question.type === SurveyQuestionType.RATING
          ? {
              ...makeRatingResult(question.ratingMin ?? 1, question.ratingMax ?? 5, questionAnswers),
              minLabel: question.ratingMinLabel,
              maxLabel: question.ratingMaxLabel,
            }
          : null;

        const textAnswers = isTextQuestion(question.type)
          ? anonymous
            ? questionAnswers
                .flatMap((answer) => answer.textValue == null ? [] : [{ text: answer.textValue }])
                // Alphabetical order is stable and does not reveal submission sequence.
                .sort((a, b) => a.text.localeCompare(b.text, "fa"))
            : (namedTextByQuestion.get(question.id) ?? []).flatMap((answer) =>
                answer.textValue === null
                  ? []
                  : [{
                      text: answer.textValue,
                      responseId: answer.response.id,
                      submittedAt: answer.response.submittedAt,
                      respondent: answer.response.user,
                    }],
              )
          : [];

        return { id: question.id, prompt: question.prompt, type: question.type, choices, rating, textAnswers };
      }),
    };
  });
}

async function loadSurveyResultAccess(
  tx: DbClient,
  input: { actorUserId: string; surveyId: string },
): Promise<SurveyResultAccess> {
  const user = await loadActiveActorUser(input.actorUserId, tx);
  const survey = await tx.survey.findUnique({
    where: { id: input.surveyId },
    select: { id: true, title: true, kind: true, identityMode: true, state: true, startsAt: true, endsAt: true, ownerId: true },
  });

  if (!survey) {
    throw new SurveyServiceError("Survey access was denied.", "ACCESS_DENIED");
  }

  const actor = await resolveSurveyActor(tx, {
    actorUserId: input.actorUserId,
    surveyId: survey.id,
    ownerId: survey.ownerId,
    user,
  });

  if (!canViewSurveyResults(actor)) {
    throw new SurveyServiceError("Survey access was denied.", "ACCESS_DENIED");
  }

  const [recipientCount, submittedCount] = await Promise.all([
    tx.surveyRecipient.count({ where: { surveyId: survey.id } }),
    tx.surveyResponse.count({ where: { surveyId: survey.id } }),
  ]);
  const displayState = getSurveyDisplayState(survey, new Date());
  const base: SurveyResultBase = {
    survey: { id: survey.id, title: survey.title, kind: survey.kind, identityMode: survey.identityMode, displayState },
    participation: {
      recipientCount,
      submittedCount,
      responseRate: recipientCount === 0 ? null : submittedCount / recipientCount,
    },
  };

  if (survey.kind === SurveyKind.VOTE && displayState !== "ENDED") {
    return { ...base, availability: "VOTE_EMBARGO" };
  }

  if (survey.identityMode === SurveyIdentityMode.ANONYMOUS && submittedCount < 5) {
    return { ...base, availability: "ANONYMOUS_PRIVACY_THRESHOLD" };
  }

  return { ...base, availability: "AVAILABLE" };
}

function isChoiceQuestion(type: SurveyQuestionType): boolean {
  return type === SurveyQuestionType.SINGLE_CHOICE || type === SurveyQuestionType.MULTIPLE_CHOICE;
}

function isTextQuestion(type: SurveyQuestionType): boolean {
  return type === SurveyQuestionType.SHORT_TEXT || type === SurveyQuestionType.LONG_TEXT;
}

function makeRatingResult(
  min: number,
  max: number,
  answers: Array<{ numericValue: number | null }>,
) {
  const values = answers.flatMap((answer) => answer.numericValue == null ? [] : [answer.numericValue]);
  return {
    min,
    max,
    distribution: Array.from({ length: max - min + 1 }, (_, index) => {
      const value = min + index;
      return { value, count: values.filter((rating) => rating === value).length };
    }),
    average: values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length,
  };
}
