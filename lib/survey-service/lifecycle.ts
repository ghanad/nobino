import "server-only";

import { db } from "@/lib/db";
import { SurveyAudienceMode, SurveyState } from "@prisma/client";

import { canPerformLifecycleAction } from "@/lib/survey-permissions";
import {
  SurveyServiceError,
  loadActiveActorUser,
  resolveSurveyActor,
  type DbClient,
} from "@/lib/survey-service/shared";
import { assertSurveyMetadataReadyForPublish } from "@/lib/survey-service/metadata";
import { assertSurveyQuestionsReadyForPublish } from "@/lib/survey-service/questions";

// ──────────────────────────────────────────────
// Resolve audience for publication
// ──────────────────────────────────────────────

async function resolveAudienceForPublish(
  surveyId: string,
  tx: DbClient,
): Promise<string[]> {
  const survey = await tx.survey.findUnique({
    where: { id: surveyId },
    select: { audienceMode: true },
  });

  if (!survey) {
    throw new SurveyServiceError("Survey was not found.");
  }

  if (survey.audienceMode === SurveyAudienceMode.ALL_ACTIVE) {
    const users = await tx.user.findMany({
      where: { active: true, deletedAt: null },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  // TARGETED: union of selected teams' active members and selected individual users
  const teamMembers = await tx.team.findMany({
    where: {
      surveyAudienceSelections: { some: { surveyId } },
    },
    select: {
      members: {
        where: { user: { active: true, deletedAt: null } },
        select: { userId: true },
      },
    },
  });

  const teamMemberIds = new Set(
    teamMembers.flatMap((t) => t.members.map((m) => m.userId)),
  );

  const explicitUserSelections = await tx.surveyAudienceUser.findMany({
    where: {
      surveyId,
      user: { active: true, deletedAt: null },
    },
    select: { userId: true },
  });

  for (const sel of explicitUserSelections) {
    teamMemberIds.add(sel.userId);
  }

  return [...teamMemberIds];
}

// ──────────────────────────────────────────────
// Publish
// ──────────────────────────────────────────────

export async function publishSurvey(input: {
  actorUserId: string;
  surveyId: string;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: {
        id: true,
        state: true,
        ownerId: true,
        title: true,
        description: true,
        kind: true,
        identityMode: true,
        startsAt: true,
        endsAt: true,
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

    if (!canPerformLifecycleAction(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can publish a survey.",
      );
    }

    if (survey.state !== SurveyState.DRAFT) {
      throw new SurveyServiceError("Only draft surveys can be published.");
    }

    assertSurveyMetadataReadyForPublish(survey);

    // Require start and end dates
    if (!survey.startsAt || !survey.endsAt) {
      throw new SurveyServiceError(
        "Both start and end times are required before publishing.",
      );
    }

    // End must be after start
    if (survey.endsAt.getTime() <= survey.startsAt.getTime()) {
      throw new SurveyServiceError(
        "End time must be after start time.",
      );
    }

    // At least one question
    const questionCount = await tx.surveyQuestion.count({
      where: { surveyId: survey.id },
    });

    if (questionCount < 1) {
      throw new SurveyServiceError(
        "At least one question is required before publishing.",
      );
    }

    // Validate questions
    await assertSurveyQuestionsReadyForPublish(survey.id, tx);

    // Resolve audience
    const recipientUserIds = await resolveAudienceForPublish(survey.id, tx);

    if (recipientUserIds.length < 1) {
      throw new SurveyServiceError(
        "At least one recipient is required before publishing.",
      );
    }

    // Anonymous surveys require at least 5 recipients
    if (
      survey.identityMode === "ANONYMOUS" &&
      recipientUserIds.length < 5
    ) {
      throw new SurveyServiceError(
        "Anonymous surveys require at least 5 eligible recipients.",
      );
    }

    // Create recipient snapshot rows (deduplicated by unique constraint)
    for (const userId of recipientUserIds) {
      await tx.surveyRecipient.create({
        data: {
          surveyId: survey.id,
          userId,
        },
      });
    }

    // Update state
    const now = new Date();
    await tx.survey.update({
      where: { id: survey.id },
      data: {
        state: SurveyState.PUBLISHED,
        publishedAt: now,
      },
    });

    // Audit
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_PUBLISHED",
        newValue: {
          title: survey.title,
          kind: survey.kind,
          identityMode: survey.identityMode,
          recipientCount: recipientUserIds.length,
          startsAt: survey.startsAt.toISOString(),
          endsAt: survey.endsAt.toISOString(),
        },
      },
    });
  });
}

// ──────────────────────────────────────────────
// Extend end time
// ──────────────────────────────────────────────

export async function extendSurveyEndTime(input: {
  actorUserId: string;
  surveyId: string;
  newEndsAt: Date;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: {
        id: true,
        state: true,
        ownerId: true,
        title: true,
        startsAt: true,
        endsAt: true,
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

    if (!canPerformLifecycleAction(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can extend the end time.",
      );
    }

    if (survey.state !== SurveyState.PUBLISHED) {
      throw new SurveyServiceError(
        "Only published surveys can have their end time extended.",
      );
    }

    const now = new Date();
    if (
      !survey.startsAt ||
      !survey.endsAt ||
      now.getTime() < survey.startsAt.getTime() ||
      now.getTime() >= survey.endsAt.getTime()
    ) {
      throw new SurveyServiceError(
        "Only active surveys can have their end time extended.",
      );
    }

    if (
      !Number.isFinite(input.newEndsAt.getTime()) ||
      input.newEndsAt.getTime() <= survey.endsAt.getTime()
    ) {
      throw new SurveyServiceError(
        "New end time must be after the current end time.",
      );
    }

    const oldEndsAt = survey.endsAt;
    await tx.survey.update({
      where: { id: survey.id },
      data: { endsAt: input.newEndsAt },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_END_TIME_EXTENDED",
        oldValue: { endsAt: oldEndsAt?.toISOString() },
        newValue: { endsAt: input.newEndsAt.toISOString() },
      },
    });
  });
}

// ──────────────────────────────────────────────
// Close early
// ──────────────────────────────────────────────

export async function closeSurvey(input: {
  actorUserId: string;
  surveyId: string;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: {
        id: true,
        state: true,
        ownerId: true,
        title: true,
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

    if (!canPerformLifecycleAction(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can close a survey.",
      );
    }

    if (survey.state !== SurveyState.PUBLISHED) {
      throw new SurveyServiceError(
        "Only published surveys can be closed.",
      );
    }

    const now = new Date();
    await tx.survey.update({
      where: { id: survey.id },
      data: {
        state: SurveyState.CLOSED,
        closedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_CLOSED",
        newValue: {
          title: survey.title,
          closedAt: now.toISOString(),
        },
      },
    });
  });
}

// ──────────────────────────────────────────────
// Archive
// ──────────────────────────────────────────────

export async function archiveSurvey(input: {
  actorUserId: string;
  surveyId: string;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: {
        id: true,
        state: true,
        ownerId: true,
        title: true,
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

    if (!canPerformLifecycleAction(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can archive a survey.",
      );
    }

    // Only ended/closed surveys may be archived
    if (survey.state !== SurveyState.CLOSED && survey.state !== SurveyState.PUBLISHED) {
      throw new SurveyServiceError(
        "Only ended or closed surveys can be archived.",
      );
    }

    // If PUBLISHED, it must have ended (now >= endsAt)
    if (survey.state === SurveyState.PUBLISHED) {
      const fullSurvey = await tx.survey.findUnique({
        where: { id: survey.id },
        select: { endsAt: true },
      });
      if (!fullSurvey?.endsAt || new Date().getTime() < fullSurvey.endsAt.getTime()) {
        throw new SurveyServiceError(
          "Only ended or closed surveys can be archived.",
        );
      }
    }

    const now = new Date();
    await tx.survey.update({
      where: { id: survey.id },
      data: {
        state: SurveyState.ARCHIVED,
        archivedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_ARCHIVED",
        newValue: {
          title: survey.title,
          archivedAt: now.toISOString(),
        },
      },
    });
  });
}
