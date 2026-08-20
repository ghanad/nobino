"use server";

import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import { submitNamedResponse } from "@/lib/survey-service/submit-response";
import { SurveyServiceError } from "@/lib/survey-service/shared";

export type SubmitActionState = {
  message?: string;
  status: "idle" | "submitting" | "success" | "error";
};

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

  const parsed = z
    .object({
      surveyId: z.string().min(1, "شناسه نظرسنجی نامعتبر است."),
      answers: z.record(z.unknown()),
    })
    .safeParse(data);

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
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}
