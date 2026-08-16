import { SurveyState } from "@prisma/client";
import type { Survey } from "@prisma/client";

import { SurveyKind, SurveyIdentityMode } from "@prisma/client";

export function getSurveyDisplayStateLabel(state: SurveyDisplayState): string {
  switch (state) {
    case "DRAFT":
      return "پیش‌نویس";
    case "SCHEDULED":
      return "زمان‌بندی‌شده";
    case "ACTIVE":
      return "فعال";
    case "ENDED":
      return "پایان‌یافته";
    case "ARCHIVED":
      return "بایگانی‌شده";
  }
}

export function getSurveyKindLabel(kind: SurveyKind): string {
  switch (kind) {
    case SurveyKind.SATISFACTION:
      return "رضایت‌سنجی";
    case SurveyKind.DATA_COLLECTION:
      return "جمع‌آوری اطلاعات";
    case SurveyKind.VOTE:
      return "رای‌گیری";
  }
}

export function getSurveyIdentityLabel(mode: SurveyIdentityMode): string {
  switch (mode) {
    case SurveyIdentityMode.NAMED:
      return "مشخص";
    case SurveyIdentityMode.ANONYMOUS:
      return "ناشناس";
  }
}

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
