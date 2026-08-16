import "server-only";

import { db } from "@/lib/db";
import { canManageSurveyAccess } from "@/lib/survey-permissions";
import {
  SurveyServiceError,
  loadActiveActorUser,
  resolveSurveyActor,
} from "@/lib/survey-service/shared";

export async function addCollaborator(input: {
  actorUserId: string;
  surveyId: string;
  targetUserId: string;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: { id: true, ownerId: true },
    });

    if (!survey) {
      throw new SurveyServiceError("Survey was not found.");
    }

    if (survey.ownerId === input.targetUserId) {
      throw new SurveyServiceError(
        "The survey owner cannot be added as a collaborator.",
      );
    }

    const actor = await resolveSurveyActor(tx, {
      actorUserId: input.actorUserId,
      surveyId: survey.id,
      ownerId: survey.ownerId,
      user,
    });

    if (!canManageSurveyAccess(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can manage collaborators.",
      );
    }

    const existing = await tx.surveyCollaborator.findUnique({
      where: {
        surveyId_userId: {
          surveyId: survey.id,
          userId: input.targetUserId,
        },
      },
    });

    if (existing) {
      throw new SurveyServiceError(
        "That user is already a collaborator on this survey.",
      );
    }

    const targetUser = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, name: true, email: true, active: true, deletedAt: true },
    });

    if (!targetUser) {
      throw new SurveyServiceError("Target user was not found.");
    }

    if (!targetUser.active || targetUser.deletedAt != null) {
      throw new SurveyServiceError(
        "Only active users can be added as collaborators.",
      );
    }

    await tx.surveyCollaborator.create({
      data: {
        surveyId: survey.id,
        userId: input.targetUserId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_COLLABORATOR_ADDED",
        newValue: {
          targetUserId: targetUser.id,
          targetUserName: targetUser.name,
          targetUserEmail: targetUser.email,
        },
      },
    });
  });
}

export async function removeCollaborator(input: {
  actorUserId: string;
  surveyId: string;
  targetUserId: string;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: { id: true, ownerId: true },
    });

    if (!survey) {
      throw new SurveyServiceError("Survey was not found.");
    }

    const actor = await resolveSurveyActor(tx, {
      actorUserId: input.actorUserId,
      surveyId: survey.id,
      ownerId: survey.ownerId,
      user,
    });

    if (!canManageSurveyAccess(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can manage collaborators.",
      );
    }

    const existing = await tx.surveyCollaborator.findUnique({
      where: {
        surveyId_userId: {
          surveyId: survey.id,
          userId: input.targetUserId,
        },
      },
    });

    if (!existing) {
      throw new SurveyServiceError(
        "That user is not a collaborator on this survey.",
      );
    }

    const targetUser = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, name: true, email: true },
    });

    await tx.surveyCollaborator.delete({
      where: { id: existing.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_COLLABORATOR_REMOVED",
        oldValue: targetUser
          ? {
              targetUserId: targetUser.id,
              targetUserName: targetUser.name,
              targetUserEmail: targetUser.email,
            }
          : {
              targetUserId: input.targetUserId,
            },
      },
    });
  });
}
