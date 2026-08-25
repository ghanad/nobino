import "server-only";

import { db } from "@/lib/db";
import { canSendSurveyReminder } from "@/lib/survey-permissions";
import {
  loadActiveActorUser,
  resolveSurveyActor,
  SurveyServiceError,
} from "@/lib/survey-service/shared";
import { getSurveyDisplayState } from "@/lib/survey-status";

export const SURVEY_REMINDER_COOLDOWN_MS = 15 * 60 * 1000;

export type SurveyReminderBatchResult = {
  eligibleCount: number;
  createdCount: number;
  withoutActiveBaleLinkCount: number;
  lastReminderAt: Date;
};

/**
 * Creates one reminder batch for snapshot recipients who have not submitted.
 * The conditional survey update is the transactional cooldown gate: concurrent
 * calls cannot both claim a batch, even when there are no eligible recipients.
 */
export async function sendSurveyReminder(input: {
  actorUserId: string;
  surveyId: string;
}): Promise<SurveyReminderBatchResult> {
  const now = new Date();
  const cooldownThreshold = new Date(now.getTime() - SURVEY_REMINDER_COOLDOWN_MS);

  return db.$transaction(async (tx) => {
    const user = await loadActiveActorUser(input.actorUserId, tx);
    const survey = await tx.survey.findUnique({
      where: { id: input.surveyId },
      select: {
        id: true,
        title: true,
        ownerId: true,
        state: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!survey) {
      throw new SurveyServiceError("Survey was not found.");
    }

    const actor = await resolveSurveyActor(tx, {
      actorUserId: input.actorUserId,
      surveyId: survey.id,
      ownerId: survey.ownerId,
      user,
    });
    const displayState = getSurveyDisplayState(survey, now);

    if (!canSendSurveyReminder(actor, displayState)) {
      throw new SurveyServiceError(
        "Only the survey owner or an admin can remind recipients of an active survey.",
        "ACCESS_DENIED",
      );
    }

    // This is deliberately an atomic claim instead of a read-then-write check.
    const claimed = await tx.survey.updateMany({
      where: {
        id: survey.id,
        OR: [
          { lastReminderAt: null },
          { lastReminderAt: { lte: cooldownThreshold } },
        ],
      },
      data: { lastReminderAt: now },
    });

    if (claimed.count === 0) {
      throw new SurveyServiceError(
        "یادآوری قبلی کمتر از ۱۵ دقیقه پیش ارسال شده است. لطفاً بعداً دوباره تلاش کنید.",
      );
    }

    const recipients = await tx.surveyRecipient.findMany({
      where: { surveyId: survey.id, hasSubmitted: false },
      select: {
        userId: true,
        user: {
          select: {
            active: true,
            baleConnection: { select: { enabled: true } },
          },
        },
      },
    });
    const eligibleCount = recipients.length;
    const withoutActiveBaleLinkCount = recipients.filter(
      (recipient) =>
        !recipient.user.active || recipient.user.baleConnection?.enabled !== true,
    ).length;

    if (eligibleCount > 0) {
      const body = `یادآوری: مهلت شرکت در نظرسنجی «${survey.title}» هنوز به پایان نرسیده است.`;
      await tx.notification.createMany({
        data: recipients.map((recipient) => ({
          userId: recipient.userId,
          surveyId: survey.id,
          type: "SURVEY_REMINDER",
          title: "یادآوری نظرسنجی",
          body,
        })),
      });
      await tx.surveyRecipient.updateMany({
        where: { surveyId: survey.id, hasSubmitted: false },
        data: { lastReminderAt: now, reminderCount: { increment: 1 } },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_REMINDERS_SENT",
        newValue: {
          batchAt: now.toISOString(),
          eligibleCount,
          createdCount: eligibleCount,
          withoutActiveBaleLinkCount,
        },
      },
    });

    return {
      eligibleCount,
      createdCount: eligibleCount,
      withoutActiveBaleLinkCount,
      lastReminderAt: now,
    };
  });
}
