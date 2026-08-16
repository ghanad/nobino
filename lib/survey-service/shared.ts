import "server-only";

import { type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { SurveyActor, SurveyActorUser } from "@/lib/survey-permissions";

export type DbClient = typeof db | Prisma.TransactionClient;

export class SurveyServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SurveyServiceError";
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
    throw new SurveyServiceError("User was not found.");
  }

  if (!user.active || user.deletedAt !== null) {
    throw new SurveyServiceError("The acting user is inactive.");
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
  const isRecipient = isOwner
    ? false
    : (await client.surveyRecipient.findUnique({
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
