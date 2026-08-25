"use server";

import { revalidatePath } from "next/cache";

import type {
  SurveyConditionOperator,
  SurveyQuestionType,
} from "@prisma/client";

import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import {
  removeQuestionCondition,
  setQuestionCondition,
  updateQuestion,
} from "@/lib/survey-service/questions";
import {
  removeQuestionConditionSchema,
  setQuestionConditionSchema,
  updateQuestionRandomizeSchema,
} from "@/lib/survey-validators";

export type QuestionConditionData = {
  id: string;
  sourceQuestionId: string;
  sourceQuestionPrompt: string;
  sourceQuestionType: SurveyQuestionType;
  sourceOptionId: string;
  sourceOptionLabel: string;
  operator: SurveyConditionOperator;
};

export type BranchingActionState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
  status: "error" | "idle" | "success";
  condition?: QuestionConditionData;
};

function toConditionData(condition: {
  id: string;
  sourceQuestionId: string;
  sourceQuestion: { prompt: string; type: SurveyQuestionType };
  sourceOption: { id: string; label: string };
  operator: SurveyConditionOperator;
}): QuestionConditionData {
  return {
    id: condition.id,
    sourceQuestionId: condition.sourceQuestionId,
    sourceQuestionPrompt: condition.sourceQuestion.prompt,
    sourceQuestionType: condition.sourceQuestion.type,
    sourceOptionId: condition.sourceOption.id,
    sourceOptionLabel: condition.sourceOption.label,
    operator: condition.operator,
  };
}

export async function setQuestionConditionAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<BranchingActionState> {
  const user = await requireCurrentUser();

  const parsed = setQuestionConditionSchema.safeParse({
    surveyId: formData.get("surveyId"),
    targetQuestionId: formData.get("targetQuestionId"),
    sourceQuestionId: formData.get("sourceQuestionId"),
    sourceOptionId: formData.get("sourceOptionId"),
    operator: formData.get("operator"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await setQuestionCondition({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      targetQuestionId: parsed.data.targetQuestionId,
      sourceQuestionId: parsed.data.sourceQuestionId,
      sourceOptionId: parsed.data.sourceOptionId,
      operator: parsed.data.operator,
    });

    // Service returns void; query the created condition by unique targetQuestionId
    const condition = await db.surveyQuestionCondition.findUnique({
      where: { targetQuestionId: parsed.data.targetQuestionId },
      select: {
        id: true,
        sourceQuestionId: true,
        sourceQuestion: {
          select: { prompt: true, type: true },
        },
        sourceOption: { select: { id: true, label: true } },
        operator: true,
      },
    });

    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);

    return {
      message: "شرط نمایش با موفقیت ذخیره شد.",
      status: "success",
      condition: condition ? toConditionData(condition) : undefined,
    };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function removeQuestionConditionAction(
  prevState: Record<string, unknown>,
  formData: FormData,
): Promise<BranchingActionState> {
  const user = await requireCurrentUser();

  const parsed = removeQuestionConditionSchema.safeParse({
    surveyId: formData.get("surveyId"),
    targetQuestionId: formData.get("targetQuestionId"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      status: "error",
    };
  }

  try {
    await removeQuestionCondition({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      targetQuestionId: parsed.data.targetQuestionId,
    });

    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);

    return {
      message: "شرط نمایش حذف شد.",
      status: "success",
    };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export type RandomizeActionState = {
  errors?: Record<string, string[] | undefined>;
  message?: string;
  status: "error" | "idle" | "success";
  randomizeOptions?: boolean;
};

export async function updateQuestionRandomizeAction(
  prevState: RandomizeActionState,
  formData: FormData,
): Promise<RandomizeActionState> {
  const user = await requireCurrentUser();

  const parsed = updateQuestionRandomizeSchema.safeParse({
    surveyId: formData.get("surveyId"),
    questionId: formData.get("questionId"),
    randomizeOptions: formData.get("randomizeOptions") === "true",
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: "اطلاعات نامعتبر است.",
      status: "error",
    };
  }

  try {
    const question = await updateQuestion({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      questionId: parsed.data.questionId,
      randomizeOptions: parsed.data.randomizeOptions,
    });

    revalidatePath(`/surveys/${parsed.data.surveyId}/edit`);

    return {
      message: "تنظیم نمایش تصادفی ذخیره شد.",
      status: "success",
      randomizeOptions: question.randomizeOptions,
    };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}
