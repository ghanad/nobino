import "server-only";

import { type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SurveyActor, SurveyActorUser } from "@/lib/survey-permissions";

export type DbClient = typeof db | Prisma.TransactionClient;

export type SurveyServiceErrorCode =
  | "ACCESS_DENIED"
  | "ALREADY_SUBMITTED"
  | "INVALID_SUBMISSION";

export class SurveyServiceError extends Error {
  readonly code: SurveyServiceErrorCode;

  constructor(
    message: string,
    code: SurveyServiceErrorCode = "INVALID_SUBMISSION",
  ) {
    super(message);
    this.name = "SurveyServiceError";
    this.code = code;
  }
}

export async function loadActiveActorUser(
  userId: string,
  client: DbClient,
): Promise<SurveyActorUser> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      active: true,
      canCreateSurveys: true,
      deletedAt: true,
    },
  });

  if (!user) {
    throw new SurveyServiceError("Survey access was denied.", "ACCESS_DENIED");
  }

  if (!user.active || user.deletedAt !== null) {
    throw new SurveyServiceError("Survey access was denied.", "ACCESS_DENIED");
  }

  return {
    role: user.role,
    active: user.active,
    canCreateSurveys: user.canCreateSurveys,
  };
}

export async function resolveSurveyActor(
  client: DbClient,
  input: {
    actorUserId: string;
    surveyId: string;
    ownerId: string;
    user: SurveyActorUser;
  },
): Promise<SurveyActor> {
  const isOwner = input.ownerId === input.actorUserId;
  const isCollaborator = isOwner
    ? false
    : (await client.surveyCollaborator.findUnique({
        where: {
          surveyId_userId: {
            surveyId: input.surveyId,
            userId: input.actorUserId,
          },
        },
        select: { id: true },
      })) !== null;
  // Ownership grants management access, but it must not hide a recipient
  // snapshot created for the owner by an ALL_ACTIVE or targeted audience.
  const isRecipient = (await client.surveyRecipient.findUnique({
    where: {
      surveyId_userId: {
        surveyId: input.surveyId,
        userId: input.actorUserId,
      },
    },
    select: { id: true },
  })) !== null;

  return { user: input.user, isOwner, isCollaborator, isRecipient };
}
