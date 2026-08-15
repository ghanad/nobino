import { SurveyState } from "@prisma/client";
import type { Survey } from "@prisma/client";

export type SurveyDisplayState =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "ENDED"
  | "ARCHIVED";

/**
 * Derives the display state of a survey from its persisted state and the
 * injected `now` value. Pure and deterministic so services and UI share one
 * definition without a scheduler.
 *
 * - DRAFT and ARCHIVED map directly to their persisted states.
 * - CLOSED always displays as ENDED.
 * - PUBLISHED is SCHEDULED before startsAt, ENDED at/after endsAt, and
 *   ACTIVE otherwise. Exactly at startsAt is active; exactly at endsAt is ended.
 */
export function getSurveyDisplayState(
  survey: Pick<Survey, "state" | "startsAt" | "endsAt">,
  now: Date,
): SurveyDisplayState {
  switch (survey.state) {
    case SurveyState.DRAFT:
      return "DRAFT";
    case SurveyState.ARCHIVED:
      return "ARCHIVED";
    case SurveyState.CLOSED:
      return "ENDED";
    case SurveyState.PUBLISHED: {
      const nowMs = now.getTime();

      if (survey.startsAt !== null && nowMs < survey.startsAt.getTime()) {
        return "SCHEDULED";
      }

      if (survey.endsAt !== null && nowMs >= survey.endsAt.getTime()) {
        return "ENDED";
      }

      return "ACTIVE";
    }
  }
}
