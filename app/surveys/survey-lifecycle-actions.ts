"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import {
  publishSurveySchema,
  extendSurveyEndTimeSchema,
  closeSurveySchema,
  archiveSurveySchema,
  deleteSurveyDraftSchema,
  sendSurveyReminderSchema,
} from "@/lib/survey-validators";
import { buildLocalDateAtHourFromJalali } from "@/lib/jalali-date";
import {
  publishSurvey,
  extendSurveyEndTime,
  closeSurvey,
  archiveSurvey,
} from "@/lib/survey-service/lifecycle";
import { deleteSurveyDraft } from "@/lib/survey-service/metadata";
import { sendSurveyReminder } from "@/lib/survey-service/reminder";

export type LifecycleActionState = {
  message?: string;
  status: "error" | "idle" | "success";
};

export async function publishSurveyAction(
  prevState: LifecycleActionState,
  formData: FormData,
): Promise<LifecycleActionState> {
  const user = await requireCurrentUser();

  const parsed = publishSurveySchema.safeParse({
    surveyId: formData.get("surveyId"),
  });

  if (!parsed.success) {
    return {
      message: parsed.error.errors[0]?.message ?? "شناسه نظرسنجی نامعتبر است.",
      status: "error",
    };
  }

  const { surveyId } = parsed.data;

  try {
    await publishSurvey({ actorUserId: user.id, surveyId });
    revalidatePath(`/surveys/${surveyId}/edit`);
    return { message: "نظرسنجی با موفقیت منتشر شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function extendSurveyEndTimeAction(
  prevState: LifecycleActionState,
  formData: FormData,
): Promise<LifecycleActionState> {
  const user = await requireCurrentUser();

  const parsed = extendSurveyEndTimeSchema.safeParse({
    surveyId: formData.get("surveyId"),
    newEndDate: formData.get("newEndDate"),
    newEndTime: formData.get("newEndTime"),
  });

  if (!parsed.success) {
    return {
      message: parsed.error.errors[0]?.message ?? "تاریخ و ساعت پایان جدید نامعتبر است.",
      status: "error",
    };
  }

  const { surveyId, newEndDate, newEndTime } = parsed.data;

  try {
    const newEndsAt = buildLocalDateAtHourFromJalali(
      newEndDate,
      Number(newEndTime.split(":")[0]),
    );

    await extendSurveyEndTime({
      actorUserId: user.id,
      surveyId,
      newEndsAt,
    });

    revalidatePath(`/surveys/${surveyId}/edit`);
    return { message: "زمان پایان نظرسنجی با موفقیت تمدید شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function closeSurveyAction(
  prevState: LifecycleActionState,
  formData: FormData,
): Promise<LifecycleActionState> {
  const user = await requireCurrentUser();

  const parsed = closeSurveySchema.safeParse({
    surveyId: formData.get("surveyId"),
  });

  if (!parsed.success) {
    return {
      message: parsed.error.errors[0]?.message ?? "شناسه نظرسنجی نامعتبر است.",
      status: "error",
    };
  }

  const { surveyId } = parsed.data;

  try {
    await closeSurvey({ actorUserId: user.id, surveyId });
    revalidatePath(`/surveys/${surveyId}/edit`);
    return { message: "نظرسنجی با موفقیت بسته شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function archiveSurveyAction(
  prevState: LifecycleActionState,
  formData: FormData,
): Promise<LifecycleActionState> {
  const user = await requireCurrentUser();

  const parsed = archiveSurveySchema.safeParse({
    surveyId: formData.get("surveyId"),
  });

  if (!parsed.success) {
    return {
      message: parsed.error.errors[0]?.message ?? "شناسه نظرسنجی نامعتبر است.",
      status: "error",
    };
  }

  const { surveyId } = parsed.data;

  try {
    await archiveSurvey({ actorUserId: user.id, surveyId });
    revalidatePath(`/surveys/${surveyId}/edit`);
    return { message: "نظرسنجی با موفقیت بایگانی شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function deleteSurveyDraftAction(
  prevState: LifecycleActionState,
  formData: FormData,
): Promise<LifecycleActionState> {
  const user = await requireCurrentUser();

  const parsed = deleteSurveyDraftSchema.safeParse({
    surveyId: formData.get("surveyId"),
  });

  if (!parsed.success) {
    return {
      message: parsed.error.errors[0]?.message ?? "شناسه نظرسنجی نامعتبر است.",
      status: "error",
    };
  }

  const { surveyId } = parsed.data;

  try {
    await deleteSurveyDraft({ actorUserId: user.id, surveyId });
    redirect("/surveys");
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function sendSurveyReminderAction(
  prevState: LifecycleActionState,
  formData: FormData,
): Promise<LifecycleActionState> {
  const user = await requireCurrentUser();
  const parsed = sendSurveyReminderSchema.safeParse({
    surveyId: formData.get("surveyId"),
  });

  if (!parsed.success) {
    return {
      message: parsed.error.errors[0]?.message ?? "شناسه نظرسنجی نامعتبر است.",
      status: "error",
    };
  }

  const { surveyId } = parsed.data;
  try {
    const result = await sendSurveyReminder({ actorUserId: user.id, surveyId });
    revalidatePath(`/surveys/${surveyId}/edit`);
    return {
      message: `${result.createdCount} یادآوری برای ${result.eligibleCount} دریافت‌کننده ثبت شد.${result.withoutActiveBaleLinkCount > 0 ? ` ${result.withoutActiveBaleLinkCount} نفر اتصال فعال بله ندارند.` : ""}`,
      status: "success",
    };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}
