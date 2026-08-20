"use server";

import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import {
  loadDraft,
  upsertDraft,
  deleteDraft,
} from "@/lib/survey-service/draft-response";
import { SurveyServiceError } from "@/lib/survey-service/shared";

export type SaveDraftActionState = {
  message?: string;
  status: "idle" | "saving" | "saved" | "error";
};

/**
 * Save (upsert) a draft for the current user.
 *
 * Accepts JSON-serialized data so the client can call it programmatically.
 */
export async function saveDraftAction(
  _prevState: SaveDraftActionState,
  data: { surveyId: string; answers: Record<string, unknown> },
): Promise<SaveDraftActionState> {
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
    await upsertDraft({
      actorUserId: user.id,
      surveyId: parsed.data.surveyId,
      answers: parsed.data.answers,
    });

    return { status: "saved" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

/**
 * Load the current user's draft for a survey.
 */
export async function loadDraftAction(
  surveyId: string,
): Promise<{ answers: Record<string, unknown> | null }> {
  const user = await requireCurrentUser();

  const answers = await loadDraft({
    actorUserId: user.id,
    surveyId,
  });

  return { answers };
}

/**
 * Delete the current user's draft for a survey.
 */
export async function deleteDraftAction(
  surveyId: string,
): Promise<SaveDraftActionState> {
  const user = await requireCurrentUser();

  try {
    await deleteDraft({
      actorUserId: user.id,
      surveyId,
    });

    return { status: "idle" };
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}
