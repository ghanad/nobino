"use server";

import { revalidatePath } from "next/cache";

import type { SurveyQuestionType } from "@prisma/client";

import { requireCurrentUser } from "@/lib/auth";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import {
  addQuestion,
  deleteQuestion,
  updateQuestion,
} from "@/lib/survey-service/questions";
import {
  addQuestionSchema,
  deleteQuestionSchema,
  updateQuestionSchema,
  updateQuestionWithConfigSchema,
} from "@/lib/survey-validators";

export type SurveyQuestionData = {
  id: string;
  prompt: string;
  helpText: string | null;
  type: SurveyQuestionType;
  required: boolean;
  sortOrder: number;
  randomizeOptions: boolean;
  ratingMin: number | null;
  ratingMax: number | null;
  ratingMinLabel: string | null;
  ratingMaxLabel: string | null;
  maxSelections: number | null;
};

export type QuestionActionState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
  status: "error" | "idle" | "success";
  question?: SurveyQuestionData;
};

function toQuestionData(question: {
  id: string;
  prompt: string;
  helpText: string | null;
  type: SurveyQuestionType;
  required: boolean;
  sortOrder: number;
  randomizeOptions: boolean;
  ratingMin: number | null;
  ratingMax: number | null;
  ratingMinLabel: string | null;
  ratingMaxLabel: string | null;
  maxSelections: number | null;
}): SurveyQuestionData {
  return {
    id: question.id,
    prompt: question.prompt,
    helpText: question.helpText,
    type: question.type,
    required: question.required,
    sortOrder: question.sortOrder,
    randomizeOptions: question.randomizeOptions,
    ratingMin: question.ratingMin,
    ratingMax: question.ratingMax,
    ratingMinLabel: question.ratingMinLabel,
    ratingMaxLabel: question.ratingMaxLabel,
    maxSelections: question.maxSelections,
  };
}

export async function addQuestionAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<QuestionActionState> {
  const user = await requireCurrentUser();

  const parsed = addQuestionSchema.safeParse({
    surveyId: formData.get("surveyId"),
    prompt: formData.get("prompt"),
    type: formData.get("type"),
    required: formData.get("required") === "on",
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    const question = await addQuestion({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      prompt: parsed.data.prompt,
      type: parsed.data.type,
      required: parsed.data.required,
    });

    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);

    return {
      message: "سوال با موفقیت اضافه شد.",
      status: "success",
      question: toQuestionData(question),
    };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function updateQuestionAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<QuestionActionState> {
  const user = await requireCurrentUser();

  const parsed = updateQuestionWithConfigSchema.safeParse({
    surveyId: formData.get("surveyId"),
    questionId: formData.get("questionId"),
    prompt: formData.get("prompt"),
    helpText: formData.get("helpText") || "",
    type: formData.get("type"),
    required: formData.get("required") === "on",
    randomizeOptions:
      formData.get("randomizeOptions") === "true" ? true : undefined,
    ratingMin: formData.get("ratingMin"),
    ratingMax: formData.get("ratingMax"),
    ratingMinLabel: formData.get("ratingMinLabel"),
    ratingMaxLabel: formData.get("ratingMaxLabel"),
    maxSelections: formData.get("maxSelections"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    const question = await updateQuestion({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      questionId: parsed.data.questionId,
      prompt: parsed.data.prompt,
      helpText: parsed.data.helpText || null,
      type: parsed.data.type,
      required: parsed.data.required,
      randomizeOptions: parsed.data.randomizeOptions,
      ratingMin: parsed.data.ratingMin ?? undefined,
      ratingMax: parsed.data.ratingMax ?? undefined,
      ratingMinLabel: parsed.data.ratingMinLabel || undefined,
      ratingMaxLabel: parsed.data.ratingMaxLabel || undefined,
      maxSelections: parsed.data.maxSelections ?? undefined,
    });

    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);

    return {
      message: "سوال با موفقیت ذخیره شد.",
      status: "success",
      question: toQuestionData(question),
    };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function deleteQuestionAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<QuestionActionState> {
  const user = await requireCurrentUser();

  const parsed = deleteQuestionSchema.safeParse({
    surveyId: formData.get("surveyId"),
    questionId: formData.get("questionId"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await deleteQuestion({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      questionId: parsed.data.questionId,
    });

    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);

    return { message: "سوال با موفقیت حذف شد.", status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}
