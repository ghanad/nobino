"use server";

import { revalidatePath } from "next/cache";

import type { SurveyQuestionType } from "@prisma/client";

import { requireCurrentUser } from "@/lib/auth";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import { db } from "@/lib/db";
import { canEditSurveyDraft } from "@/lib/survey-permissions";
import { resolveSurveyActor } from "@/lib/survey-service/shared";
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

export type SurveyQuestionWithRelations = SurveyQuestionData & {
  options: { id: string; label: string; sortOrder: number }[];
  targetCondition: {
    id: string;
    sourceQuestionId: string;
    sourceQuestionPrompt: string;
    sourceQuestionType: SurveyQuestionType;
    sourceOptionId: string;
    sourceOptionLabel: string;
    operator: "IS_SELECTED" | "IS_NOT_SELECTED";
  } | null;
};

export async function getSurveyQuestionsAction(surveyId: string): Promise<SurveyQuestionWithRelations[]> {
  const user = await requireCurrentUser();

  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: { id: true, state: true, ownerId: true },
  });

  if (!survey) {
    throw new SurveyServiceError("نظرسنجی پیدا نشد.");
  }

  const actor = await resolveSurveyActor(db, {
    actorUserId: user.id,
    surveyId: survey.id,
    ownerId: survey.ownerId,
    user: { role: user.role, active: user.active, canCreateSurveys: user.canCreateSurveys },
  });

  if (!canEditSurveyDraft(actor, survey.state)) {
    throw new SurveyServiceError("مجوز مشاهده سوالات را ندارید.");
  }

  const questions = await db.surveyQuestion.findMany({
    where: { surveyId },
    select: {
      id: true,
      prompt: true,
      helpText: true,
      type: true,
      required: true,
      sortOrder: true,
      randomizeOptions: true,
      ratingMin: true,
      ratingMax: true,
      ratingMinLabel: true,
      ratingMaxLabel: true,
      maxSelections: true,
      options: {
        select: { id: true, label: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
      targetCondition: {
        select: {
          id: true,
          sourceQuestionId: true,
          sourceOptionId: true,
          operator: true,
          sourceQuestion: { select: { prompt: true, type: true } },
          sourceOption: { select: { label: true } },
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  return questions.map((q) => ({
    ...toQuestionData(q),
    options: q.options,
    targetCondition: q.targetCondition
      ? {
          id: q.targetCondition.id,
          sourceQuestionId: q.targetCondition.sourceQuestionId,
          sourceQuestionPrompt: q.targetCondition.sourceQuestion.prompt,
          sourceQuestionType: q.targetCondition.sourceQuestion.type,
          sourceOptionId: q.targetCondition.sourceOptionId,
          sourceOptionLabel: q.targetCondition.sourceOption.label,
          operator: q.targetCondition.operator,
        }
      : null,
  }));
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
