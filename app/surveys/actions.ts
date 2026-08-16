"use server";

import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth";
import {
  createSurveyDraft,
  updateSurveyMetadata,
} from "@/lib/survey-service/metadata";
import { buildLocalDateAtHourFromJalali } from "@/lib/jalali-date";
import {
  createSurveySchema,
  updateMetadataSchema,
} from "@/lib/survey-validators";
import { SurveyServiceError } from "@/lib/survey-service/shared";

export type CreateSurveyActionState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
  status: "error" | "idle" | "success";
};

export async function createSurveyAction(
  prevState: CreateSurveyActionState,
  formData: FormData,
): Promise<CreateSurveyActionState> {
  const user = await requireCurrentUser();

  const parsed = createSurveySchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    kind: formData.get("kind"),
    identityMode: formData.get("identityMode"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    const survey = await createSurveyDraft({
      actorUserId: user.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      kind: parsed.data.kind,
      identityMode: parsed.data.identityMode,
    });

    redirect(`/surveys/${survey.id}/edit`);
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export type UpdateSurveyMetadataActionState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
  status: "error" | "idle" | "success";
};

export async function updateSurveyMetadataAction(
  prevState: UpdateSurveyMetadataActionState,
  formData: FormData,
): Promise<UpdateSurveyMetadataActionState> {
  const user = await requireCurrentUser();

  const parsed = updateMetadataSchema.safeParse({
    surveyId: formData.get("surveyId"),
    title: formData.get("title"),
    description: formData.get("description"),
    kind: formData.get("kind") || undefined,
    identityMode: formData.get("identityMode") || undefined,
    startDate: formData.get("startDate") || undefined,
    startTime: formData.get("startTime") || undefined,
    endDate: formData.get("endDate") || undefined,
    endTime: formData.get("endTime") || undefined,
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    const startsAt =
      parsed.data.startDate && parsed.data.startTime
        ? buildLocalDateAtHourFromJalali(
            parsed.data.startDate,
            Number(parsed.data.startTime.split(":")[0]),
          )
        : undefined;
    const endsAt =
      parsed.data.endDate && parsed.data.endTime
        ? buildLocalDateAtHourFromJalali(
            parsed.data.endDate,
            Number(parsed.data.endTime.split(":")[0]),
          )
        : undefined;

    await updateSurveyMetadata({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      kind: parsed.data.kind,
      identityMode: parsed.data.identityMode,
      startsAt,
      endsAt,
    });

    return { message: "تغییرات با موفقیت ذخیره شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}
