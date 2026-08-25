import "server-only";

import { SurveyAudienceMode, SurveyState } from "@prisma/client";

import { db } from "@/lib/db";
import { canEditSurveyDraft, isSurveyManager } from "@/lib/survey-permissions";
import {
  SurveyServiceError,
  loadActiveActorUser,
  resolveSurveyActor,
} from "@/lib/survey-service/shared";

export async function setAudienceMode(input: {
  actorUserId: string;
  surveyId: string;
  audienceMode: SurveyAudienceMode;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: {
        id: true,
        state: true,
        ownerId: true,
        audienceMode: true,
      },
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

    if (!isSurveyManager(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can change the audience mode.",
      );
    }

    if (survey.state !== SurveyState.DRAFT) {
      throw new SurveyServiceError(
        "Audience mode can only be changed on draft surveys.",
      );
    }

    if (input.audienceMode === survey.audienceMode) {
      return { id: survey.id, audienceMode: survey.audienceMode };
    }

    const updated = await tx.survey.update({
      where: { id: survey.id },
      data: { audienceMode: input.audienceMode },
      select: { id: true, audienceMode: true },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_AUDIENCE_MODE_CHANGED",
        oldValue: { audienceMode: survey.audienceMode },
        newValue: { audienceMode: input.audienceMode },
      },
    });

    return updated;
  });
}

export async function addAudienceTeam(input: {
  actorUserId: string;
  surveyId: string;
  teamId: string;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: { id: true, state: true, ownerId: true, audienceMode: true },
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

    if (!isSurveyManager(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can manage the audience.",
      );
    }

    if (survey.state !== SurveyState.DRAFT) {
      throw new SurveyServiceError(
        "Audience can only be changed on draft surveys.",
      );
    }

    if (survey.audienceMode !== SurveyAudienceMode.TARGETED) {
      throw new SurveyServiceError(
        "Teams can only be selected for a targeted audience.",
      );
    }

    const team = await tx.team.findUnique({
      where: { id: input.teamId },
      select: { id: true },
    });

    if (!team) {
      throw new SurveyServiceError("Team was not found.");
    }

    const existing = await tx.surveyAudienceTeam.findUnique({
      where: {
        surveyId_teamId: {
          surveyId: survey.id,
          teamId: team.id,
        },
      },
    });

    if (existing) {
      throw new SurveyServiceError(
        "This team is already in the audience.",
      );
    }

    await tx.surveyAudienceTeam.create({
      data: { surveyId: survey.id, teamId: team.id },
    });

    const memberCount = await tx.teamMembership.count({
      where: {
        teamId: team.id,
        user: { active: true, deletedAt: null },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_AUDIENCE_TEAM_ADDED",
        newValue: {
          teamId: team.id,
          activeMemberCount: memberCount,
        },
      },
    });
  });
}

export async function removeAudienceTeam(input: {
  actorUserId: string;
  surveyId: string;
  teamId: string;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: { id: true, state: true, ownerId: true, audienceMode: true },
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

    if (!isSurveyManager(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can manage the audience.",
      );
    }

    if (survey.state !== SurveyState.DRAFT) {
      throw new SurveyServiceError(
        "Audience can only be changed on draft surveys.",
      );
    }

    if (survey.audienceMode !== SurveyAudienceMode.TARGETED) {
      throw new SurveyServiceError(
        "Teams can only be selected for a targeted audience.",
      );
    }

    const team = await tx.team.findUnique({
      where: { id: input.teamId },
      select: { id: true },
    });

    if (!team) {
      throw new SurveyServiceError("Team was not found.");
    }

    const existing = await tx.surveyAudienceTeam.findUnique({
      where: {
        surveyId_teamId: {
          surveyId: survey.id,
          teamId: team.id,
        },
      },
    });

    if (!existing) {
      throw new SurveyServiceError(
        "This team is not in the audience.",
      );
    }

    await tx.surveyAudienceTeam.delete({
      where: { id: existing.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_AUDIENCE_TEAM_REMOVED",
        oldValue: {
          teamId: team.id,
        },
      },
    });
  });
}

export async function addAudienceUser(input: {
  actorUserId: string;
  surveyId: string;
  targetUserId: string;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: { id: true, state: true, ownerId: true, audienceMode: true },
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

    if (!isSurveyManager(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can manage the audience.",
      );
    }

    if (survey.state !== SurveyState.DRAFT) {
      throw new SurveyServiceError(
        "Audience can only be changed on draft surveys.",
      );
    }

    if (survey.audienceMode !== SurveyAudienceMode.TARGETED) {
      throw new SurveyServiceError(
        "Users can only be selected for a targeted audience.",
      );
    }

    const targetUser = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: {
        id: true,
        active: true,
        deletedAt: true,
      },
    });

    if (!targetUser) {
      throw new SurveyServiceError("Target user was not found.");
    }

    if (!targetUser.active || targetUser.deletedAt !== null) {
      throw new SurveyServiceError(
        "Only active users can be added to the audience.",
      );
    }

    const existing = await tx.surveyAudienceUser.findUnique({
      where: {
        surveyId_userId: {
          surveyId: survey.id,
          userId: targetUser.id,
        },
      },
    });

    if (existing) {
      throw new SurveyServiceError(
        "This user is already in the audience.",
      );
    }

    await tx.surveyAudienceUser.create({
      data: { surveyId: survey.id, userId: targetUser.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_AUDIENCE_USER_ADDED",
        newValue: {
          targetUserId: targetUser.id,
        },
      },
    });
  });
}

export async function removeAudienceUser(input: {
  actorUserId: string;
  surveyId: string;
  targetUserId: string;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: { id: true, state: true, ownerId: true, audienceMode: true },
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

    if (!isSurveyManager(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can manage the audience.",
      );
    }

    if (survey.state !== SurveyState.DRAFT) {
      throw new SurveyServiceError(
        "Audience can only be changed on draft surveys.",
      );
    }

    if (survey.audienceMode !== SurveyAudienceMode.TARGETED) {
      throw new SurveyServiceError(
        "Users can only be selected for a targeted audience.",
      );
    }

    const targetUser = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new SurveyServiceError("Target user was not found.");
    }

    const existing = await tx.surveyAudienceUser.findUnique({
      where: {
        surveyId_userId: {
          surveyId: survey.id,
          userId: targetUser.id,
        },
      },
    });

    if (!existing) {
      throw new SurveyServiceError(
        "This user is not in the audience.",
      );
    }

    await tx.surveyAudienceUser.delete({
      where: { id: existing.id },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_AUDIENCE_USER_REMOVED",
        oldValue: {
          targetUserId: targetUser.id,
        },
      },
    });
  });
}

export type AudiencePreview = {
  users: {
    id: string;
    name: string;
    email: string;
  }[];
  totalUniqueUsers: number;
  teamSources: {
    teamId: string;
    teamName: string;
    activeMemberCount: number;
  }[];
  explicitUserCount: number;
  hasEffectiveAudience: boolean;
};

export async function previewAudience(input: {
  actorUserId: string;
  surveyId: string;
}): Promise<AudiencePreview> {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: {
        id: true,
        state: true,
        ownerId: true,
        audienceMode: true,
      },
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

    if (!canEditSurveyDraft(actor, survey.state)) {
      throw new SurveyServiceError(
        "You do not have permission to view the audience preview.",
      );
    }

    if (survey.audienceMode === SurveyAudienceMode.ALL_ACTIVE) {
      const users = await tx.user.findMany({
        where: { active: true, deletedAt: null },
        select: { id: true, name: true, email: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });

      return {
        users,
        totalUniqueUsers: users.length,
        teamSources: [],
        explicitUserCount: 0,
        hasEffectiveAudience: users.length > 0,
      };
    }

    const selectedTeams = await tx.team.findMany({
      where: {
        surveyAudienceSelections: { some: { surveyId: survey.id } },
      },
      select: {
        id: true,
        name: true,
        members: {
          where: { user: { active: true, deletedAt: null } },
          select: { userId: true },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    const teamSources = selectedTeams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      activeMemberCount: team.members.length,
    }));

    const teamMemberIds = new Set(
      selectedTeams.flatMap((team) =>
        team.members.map((membership) => membership.userId),
      ),
    );

    const explicitUsers = await tx.surveyAudienceUser.findMany({
      where: {
        surveyId: survey.id,
        user: { active: true, deletedAt: null },
      },
      select: { userId: true },
    });

    const explicitUserIds = new Set(
      explicitUsers.map((selection) => selection.userId),
    );
    const allUserIds = [...new Set([...teamMemberIds, ...explicitUserIds])];
    const users = await tx.user.findMany({
      where: {
        id: { in: allUserIds },
        active: true,
        deletedAt: null,
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return {
      users,
      totalUniqueUsers: users.length,
      teamSources,
      explicitUserCount: explicitUserIds.size,
      hasEffectiveAudience: users.length > 0,
    };
  });
}
