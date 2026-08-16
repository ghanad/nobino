import "server-only";

import {
  SurveyAudienceMode,
  SurveyIdentityMode,
  SurveyKind,
  SurveyState,
  UserRole,
  type Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";
import { canCreateSurvey } from "@/lib/permissions";
import {
  canEditSurveyDraft,
  isSurveyManager,
} from "@/lib/survey-permissions";
import {
  loadActiveActorUser,
  resolveSurveyActor,
  SurveyServiceError,
} from "@/lib/survey-service/shared";

export const SURVEY_TITLE_MAX_LENGTH = 200;
export const SURVEY_DESCRIPTION_MAX_LENGTH = 4000;

const surveyMetadataSelect = {
  id: true,
  title: true,
  description: true,
  kind: true,
  state: true,
  identityMode: true,
  audienceMode: true,
  startsAt: true,
  endsAt: true,
  publishedAt: true,
  closedAt: true,
  archivedAt: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SurveySelect;

function normalizeTitle(title: string): string {
  return title.trim();
}

function normalizeDescription(
  description: string | null | undefined,
): string | null {
  if (description == null) {
    return null;
  }

  const trimmed = description.trim();

  return trimmed.length === 0 ? null : trimmed;
}

function assertMetadata(
  title: string,
  description: string | null | undefined,
): void {
  if (!title) {
    throw new SurveyServiceError("Survey title is required.");
  }

  if (title.length > SURVEY_TITLE_MAX_LENGTH) {
    throw new SurveyServiceError(
      `Survey title must be at most ${SURVEY_TITLE_MAX_LENGTH} characters.`,
    );
  }

  if (description && description.length > SURVEY_DESCRIPTION_MAX_LENGTH) {
    throw new SurveyServiceError(
      `Survey description must be at most ${SURVEY_DESCRIPTION_MAX_LENGTH} characters.`,
    );
  }
}

function assertValidWindow(
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
): void {
  if (
    startsAt != null &&
    endsAt != null &&
    endsAt.getTime() <= startsAt.getTime()
  ) {
    throw new SurveyServiceError(
      "Survey end time must be after its start time.",
    );
  }
}

export async function createSurveyDraft(input: {
  actorUserId: string;
  title: string;
  description?: string | null;
  kind: SurveyKind;
  identityMode: SurveyIdentityMode;
}) {
  const title = normalizeTitle(input.title);
  const description = normalizeDescription(input.description);

  assertMetadata(title, description);

  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    if (!canCreateSurvey(user)) {
      throw new SurveyServiceError(
        "You do not have permission to create surveys.",
      );
    }

    const survey = await tx.survey.create({
      data: {
        title,
        description,
        kind: input.kind,
        identityMode: input.identityMode,
        audienceMode: SurveyAudienceMode.ALL_ACTIVE,
        ownerId: input.actorUserId,
      },
      select: surveyMetadataSelect,
    });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_CREATED",
        newValue: {
          title: survey.title,
          kind: survey.kind,
          identityMode: survey.identityMode,
          audienceMode: survey.audienceMode,
        },
      },
    });

    return survey;
  });
}

export async function updateSurveyMetadata(input: {
  actorUserId: string;
  surveyId: string;
  title: string;
  description?: string | null;
  kind?: SurveyKind;
  identityMode?: SurveyIdentityMode;
  startsAt?: Date | null;
  endsAt?: Date | null;
}) {
  const title = normalizeTitle(input.title);
  const description =
    input.description === undefined
      ? undefined
      : normalizeDescription(input.description);

  assertMetadata(title, description);

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
        survey.state === SurveyState.DRAFT
          ? "You do not have permission to edit this survey."
          : "Published survey content cannot be edited.",
      );
    }

    const changesKind = input.kind !== undefined && input.kind !== survey.kind;
    const changesIdentity =
      input.identityMode !== undefined &&
      input.identityMode !== survey.identityMode;

    if ((changesKind || changesIdentity) && !isSurveyManager(actor)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can change the survey kind or identity mode.",
      );
    }

    const nextStartsAt =
      input.startsAt !== undefined ? input.startsAt : survey.startsAt;
    const nextEndsAt =
      input.endsAt !== undefined ? input.endsAt : survey.endsAt;

    assertValidWindow(nextStartsAt, nextEndsAt);

    const data: Prisma.SurveyUpdateInput = { title };

    if (description !== undefined) {
      data.description = description;
    }
    if (input.kind !== undefined) {
      data.kind = input.kind;
    }
    if (input.identityMode !== undefined) {
      data.identityMode = input.identityMode;
    }
    if (input.startsAt !== undefined) {
      data.startsAt = input.startsAt;
    }
    if (input.endsAt !== undefined) {
      data.endsAt = input.endsAt;
    }

    const updated = await tx.survey.update({
      where: { id: survey.id },
      data,
      select: surveyMetadataSelect,
    });

    const materiallyChanged =
      title !== survey.title ||
      (description !== undefined && description !== survey.description) ||
      (input.kind !== undefined && input.kind !== survey.kind) ||
      (input.identityMode !== undefined &&
        input.identityMode !== survey.identityMode) ||
      (input.startsAt !== undefined &&
        (survey.startsAt?.getTime() ?? null) !==
          (input.startsAt?.getTime() ?? null)) ||
      (input.endsAt !== undefined &&
        (survey.endsAt?.getTime() ?? null) !==
          (input.endsAt?.getTime() ?? null));

    if (materiallyChanged) {
      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          entityType: "Survey",
          entityId: survey.id,
          action: "SURVEY_UPDATED",
          oldValue: {
            title: survey.title,
            kind: survey.kind,
            identityMode: survey.identityMode,
            startsAt: survey.startsAt,
            endsAt: survey.endsAt,
          },
          newValue: {
            title: updated.title,
            kind: updated.kind,
            identityMode: updated.identityMode,
            startsAt: updated.startsAt,
            endsAt: updated.endsAt,
          },
        },
      });
    }

    return updated;
  });
}

export async function deleteSurveyDraft(input: {
  actorUserId: string;
  surveyId: string;
}) {
  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);

    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: { id: true, state: true, ownerId: true, title: true },
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
        "Only the survey owner or an admin can delete a survey.",
      );
    }

    if (survey.state !== SurveyState.DRAFT) {
      throw new SurveyServiceError("Only draft surveys can be deleted.");
    }

    await tx.survey.delete({ where: { id: survey.id } });

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_DELETED",
        oldValue: { title: survey.title },
      },
    });
  });
}

export async function listAuthoringSurveys(input: {
  actorUserId: string;
}) {
  const user = await loadActiveActorUser(input.actorUserId, db);

  const where: Prisma.SurveyWhereInput =
    user.role === UserRole.ADMIN
      ? {}
      : {
          OR: [
            { ownerId: input.actorUserId },
            { collaborators: { some: { userId: input.actorUserId } } },
          ],
        };

  return db.survey.findMany({
    where,
    select: surveyMetadataSelect,
    orderBy: { updatedAt: "desc" },
  });
}

export async function listRespondentSurveys(input: {
  actorUserId: string;
}) {
  await loadActiveActorUser(input.actorUserId, db);

  return db.survey.findMany({
    where: { recipients: { some: { userId: input.actorUserId } } },
    select: {
      ...surveyMetadataSelect,
      recipients: {
        where: { userId: input.actorUserId },
        select: { hasSubmitted: true },
      },
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
  });
}
