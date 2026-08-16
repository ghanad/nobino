"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth";
import {
  addCollaborator,
  removeCollaborator,
} from "@/lib/survey-service/collaborator";
import {
  setAudienceMode,
  addAudienceTeam,
  removeAudienceTeam,
  addAudienceUser,
  removeAudienceUser,
} from "@/lib/survey-service/audience";
import { db } from "@/lib/db";
import { canCreateSurvey } from "@/lib/permissions";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import {
  addCollaboratorSchema,
  removeCollaboratorSchema,
  setAudienceModeSchema,
  addAudienceTeamSchema,
  removeAudienceTeamSchema,
  addAudienceUserSchema,
  removeAudienceUserSchema,
} from "@/lib/survey-validators";
import type { SurveyAudienceMode } from "@prisma/client";

export type SurveyAccessActionState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
  status: "error" | "idle" | "success";
};

export async function addCollaboratorAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<SurveyAccessActionState> {
  const user = await requireCurrentUser();

  const parsed = addCollaboratorSchema.safeParse({
    surveyId: formData.get("surveyId"),
    targetUserId: formData.get("targetUserId"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await addCollaborator({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      targetUserId: parsed.data.targetUserId,
    });
    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);
    return { message: "عضو جدید با موفقیت اضافه شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function removeCollaboratorAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<SurveyAccessActionState> {
  const user = await requireCurrentUser();

  const parsed = removeCollaboratorSchema.safeParse({
    surveyId: formData.get("surveyId"),
    targetUserId: formData.get("targetUserId"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await removeCollaborator({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      targetUserId: parsed.data.targetUserId,
    });
    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);
    return { message: "عضو با موفقیت حذف شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function setAudienceModeAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<SurveyAccessActionState> {
  const user = await requireCurrentUser();

  const parsed = setAudienceModeSchema.safeParse({
    surveyId: formData.get("surveyId"),
    audienceMode: formData.get("audienceMode") as SurveyAudienceMode,
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await setAudienceMode({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      audienceMode: parsed.data.audienceMode,
    });
    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);
    return { message: "حالت مخاطب با موفقیت تغییر کرد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function addAudienceTeamAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<SurveyAccessActionState> {
  const user = await requireCurrentUser();

  const parsed = addAudienceTeamSchema.safeParse({
    surveyId: formData.get("surveyId"),
    teamId: formData.get("teamId"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await addAudienceTeam({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      teamId: parsed.data.teamId,
    });
    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);
    return { message: "تیم با موفقیت اضافه شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function removeAudienceTeamAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<SurveyAccessActionState> {
  const user = await requireCurrentUser();

  const parsed = removeAudienceTeamSchema.safeParse({
    surveyId: formData.get("surveyId"),
    teamId: formData.get("teamId"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await removeAudienceTeam({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      teamId: parsed.data.teamId,
    });
    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);
    return { message: "تیم با موفقیت حذف شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function addAudienceUserAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<SurveyAccessActionState> {
  const user = await requireCurrentUser();

  const parsed = addAudienceUserSchema.safeParse({
    surveyId: formData.get("surveyId"),
    targetUserId: formData.get("targetUserId"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await addAudienceUser({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      targetUserId: parsed.data.targetUserId,
    });
    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);
    return { message: "کاربر با موفقیت اضافه شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function removeAudienceUserAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<SurveyAccessActionState> {
  const user = await requireCurrentUser();

  const parsed = removeAudienceUserSchema.safeParse({
    surveyId: formData.get("surveyId"),
    targetUserId: formData.get("targetUserId"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await removeAudienceUser({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      targetUserId: parsed.data.targetUserId,
    });
    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);
    return { message: "کاربر با موفقیت حذف شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

// S13: Server-side search for active users suitable for collaborator or audience selection
export async function searchUsersAction(
  query: string,
): Promise<
  {
    id: string;
    name: string | null;
    email: string;
  }[]
> {
  const user = await requireCurrentUser();
  if (!canCreateSurvey(user)) {
    throw new Error("You do not have permission to search users.");
  }
  const trimmed = query.trim();

  const results = await db.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      ...(() => {
        if (!trimmed) return {};
        return {
          OR: [
            { name: { contains: trimmed } },
            { email: { contains: trimmed } },
          ],
        };
      })(),
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 50,
  });

  return results;
}

// S13: Server-side search for active teams suitable for audience selection
export async function searchTeamsAction(
  query: string,
): Promise<
  {
    id: string;
    name: string;
  }[]
> {
  const user = await requireCurrentUser();
  if (!canCreateSurvey(user)) {
    throw new Error("You do not have permission to search teams.");
  }
  const trimmed = query.trim();

  const results = await db.team.findMany({
    where: {
      ...(() => {
        if (!trimmed) return {};
        return {
          name: { contains: trimmed },
        };
      })(),
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 50,
  });

  return results;
}
