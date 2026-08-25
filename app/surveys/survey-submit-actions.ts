"use server";

import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import {
  submitAnonymousResponse,
  submitNamedResponse,
} from "@/lib/survey-service/submit-response";
import { SurveyServiceError } from "@/lib/survey-service/shared";

export type SubmitActionState = {
  message?: string;
  status: "idle" | "success" | "conflict" | "error";
};

const submitResponseSchema = z.object({
  surveyId: z.string().min(1, "شناسه نظرسنجی نامعتبر است."),
  answers: z.record(z.unknown()),
});

function getSubmitFailureState(error: unknown): SubmitActionState {
  if (error instanceof SurveyServiceError && error.code === "ALREADY_SUBMITTED") {
    return {
      message: "پاسخ شما پیش‌تر ثبت شده است. صفحه را به‌روز کنید.",
      status: "conflict",
    };
  }

  return {
    message: "امکان ثبت پاسخ وجود ندارد. لطفاً پاسخ‌ها را بررسی کرده و دوباره تلاش کنید.",
    status: "error",
  };
}

/**
 * Submit a named final response for the current user.
 *
 * Transforms the client-side answers (which may include null values for
 * optional unanswered questions) into the format expected by the service.
 */
export async function submitResponseAction(
  _prevState: SubmitActionState,
  data: { surveyId: string; answers: Record<string, unknown> },
): Promise<SubmitActionState> {
  const user = await requireCurrentUser();

  const parsed = submitResponseSchema.safeParse(data);

  if (!parsed.success) {
    return { message: "داده‌های ورودی نامعتبر است.", status: "error" };
  }

  try {
    await submitNamedResponse({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      answers: parsed.data.answers,
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return getSubmitFailureState(error);
    }
    throw error;
  }
}

/**
 * Submit an anonymous final response for the current user.
 *
 * Privacy: no audit event is created on the server side;
 * the response row stores userId = null.
 */
export async function submitAnonymousResponseAction(
  _prevState: SubmitActionState,
  data: { surveyId: string; answers: Record<string, unknown> },
): Promise<SubmitActionState> {
  const user = await requireCurrentUser();

  const parsed = submitResponseSchema.safeParse(data);

  if (!parsed.success) {
    return { message: "داده‌های ورودی نامعتبر است.", status: "error" };
  }

  try {
    await submitAnonymousResponse({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      answers: parsed.data.answers,
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return getSubmitFailureState(error);
    }
    throw error;
  }
}
