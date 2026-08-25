"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import {
  addOption,
  deleteOption,
  reorderOptions,
  reorderQuestions,
  updateOption,
} from "@/lib/survey-service/questions";
import {
  addOptionSchema,
  deleteOptionSchema,
  updateOptionSchema,
  reorderOptionsSchema,
  reorderQuestionsSchema,
} from "@/lib/survey-validators";

export type OptionData = {
  id: string;
  questionId: string;
  label: string;
  sortOrder: number;
};

export type OptionActionState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
  status: "error" | "idle" | "success";
  option?: OptionData;
};

function toOptionData(option: {
  id: string;
  questionId: string;
  label: string;
  sortOrder: number;
}): OptionData {
  return {
    id: option.id,
    questionId: option.questionId,
    label: option.label,
    sortOrder: option.sortOrder,
  };
}

export async function addOptionAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<OptionActionState> {
  const user = await requireCurrentUser();

  const parsed = addOptionSchema.safeParse({
    surveyId: formData.get("surveyId"),
    questionId: formData.get("questionId"),
    label: formData.get("label"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    const option = await addOption({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      questionId: parsed.data.questionId,
      label: parsed.data.label,
    });

    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);

    return {
      message: "گزینه با موفقیت اضافه شد.",
      status: "success",
      option: toOptionData(option),
    };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function updateOptionAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<OptionActionState> {
  const user = await requireCurrentUser();

  const parsed = updateOptionSchema.safeParse({
    surveyId: formData.get("surveyId"),
    questionId: formData.get("questionId"),
    optionId: formData.get("optionId"),
    label: formData.get("label"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    const option = await updateOption({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      questionId: parsed.data.questionId,
      optionId: parsed.data.optionId,
      label: parsed.data.label,
    });

    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);

    return {
      message: "گزینه با موفقیت ذخیره شد.",
      status: "success",
      option: toOptionData(option),
    };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function deleteOptionAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<OptionActionState> {
  const user = await requireCurrentUser();

  const parsed = deleteOptionSchema.safeParse({
    surveyId: formData.get("surveyId"),
    questionId: formData.get("questionId"),
    optionId: formData.get("optionId"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await deleteOption({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      questionId: parsed.data.questionId,
      optionId: parsed.data.optionId,
    });

    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);

    return { message: "گزینه با موفقیت حذف شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export type ReorderActionState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
  status: "error" | "idle" | "success";
};

export async function reorderOptionsAction(
  optionIds: string[],
  surveyId: string,
  questionId: string,
): Promise<ReorderActionState> {
  const user = await requireCurrentUser();

  const parsed = reorderOptionsSchema.safeParse({
    surveyId,
    questionId,
    optionIds,
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await reorderOptions({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      questionId: parsed.data.questionId,
      optionIds: parsed.data.optionIds,
    });

    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);

    return { message: "ترتیب گزینه‌ها با موفقیت ذخیره شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function reorderQuestionsAction(
  questionIds: string[],
  surveyId: string,
): Promise<ReorderActionState> {
  const user = await requireCurrentUser();

  const parsed = reorderQuestionsSchema.safeParse({
    surveyId,
    questionIds,
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await reorderQuestions({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      questionIds: parsed.data.questionIds,
    });

    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);

    return { message: "ترتیب سوالات با موفقیت ذخیره شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}
