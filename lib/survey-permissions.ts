import { SurveyState, UserRole } from "@prisma/client";

import { canCreateSurvey } from "@/lib/permissions";
import type { SurveyDisplayState } from "@/lib/survey-status";

export type SurveyActorUser = {
  role: UserRole;
  active: boolean;
  canCreateSurveys: boolean;
};

export type SurveyActor = {
  user: SurveyActorUser;
  isOwner: boolean;
  isCollaborator: boolean;
  isRecipient: boolean;
};

export { canCreateSurvey };

function isActiveAdmin(actor: SurveyActor): boolean {
  return actor.user.active && actor.user.role === UserRole.ADMIN;
}

function isOwnerWithPermission(actor: SurveyActor): boolean {
  return actor.isOwner && canCreateSurvey(actor.user);
}

/**
 * Managers may publish, close, archive, delete, send reminders, and change the
 * audience/collaborators: administrators always, otherwise the owner while the
 * owner still holds the create-survey permission.
 */
export function isSurveyManager(actor: SurveyActor): boolean {
  return isActiveAdmin(actor) || isOwnerWithPermission(actor);
}

export function canManageSurveyAccess(actor: SurveyActor): boolean {
  return isSurveyManager(actor);
}

export function canPerformLifecycleAction(actor: SurveyActor): boolean {
  return isSurveyManager(actor);
}

export function canEditSurveyDraft(
  actor: SurveyActor,
  state: SurveyState,
): boolean {
  if (state !== SurveyState.DRAFT) {
    return false;
  }

  return isSurveyManager(actor) || (actor.user.active && actor.isCollaborator);
}

export function canViewSurveyResults(actor: SurveyActor): boolean {
  return isSurveyManager(actor) || (actor.user.active && actor.isCollaborator);
}

export function canSendSurveyReminder(
  actor: SurveyActor,
  displayState: SurveyDisplayState,
): boolean {
  return isSurveyManager(actor) && displayState === "ACTIVE";
}

export function canParticipate(
  actor: SurveyActor,
  displayState: SurveyDisplayState,
): boolean {
  return actor.user.active && actor.isRecipient && displayState === "ACTIVE";
}
