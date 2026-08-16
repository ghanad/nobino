import type { Survey } from "@prisma/client";

import { getSurveyDisplayState } from "@/lib/survey-status";

type SurveyStatusSource = Pick<Survey, "state" | "startsAt" | "endsAt">;

export function groupSurveyNavigation<
  RespondentSurvey extends SurveyStatusSource & {
    recipients: Array<{ hasSubmitted: boolean }>;
  },
  AuthoringSurvey extends SurveyStatusSource,
>(input: {
  respondentSurveys: RespondentSurvey[];
  authoringSurveys: AuthoringSurvey[];
  now: Date;
}) {
  const availableToAnswer = input.respondentSurveys.filter((survey) => {
    const recipient = survey.recipients[0];

    return (
      recipient?.hasSubmitted === false &&
      getSurveyDisplayState(survey, input.now) === "ACTIVE"
    );
  });
  const completed = input.respondentSurveys.filter(
    (survey) => survey.recipients[0]?.hasSubmitted === true,
  );
  const ended = input.respondentSurveys.filter((survey) => {
    const recipient = survey.recipients[0];
    const displayState = getSurveyDisplayState(survey, input.now);

    return (
      recipient?.hasSubmitted === false &&
      (displayState === "ENDED" || displayState === "ARCHIVED")
    );
  });

  return {
    availableToAnswer,
    completed,
    ended,
    managed: input.authoringSurveys,
  };
}
