import assert from "node:assert/strict";
import test from "node:test";

import { SurveyAudienceMode, SurveyIdentityMode, SurveyKind, SurveyQuestionType, SurveyState } from "@prisma/client";

import {
  adminId,
  db,
  managerId,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";
import { createSurveyDraft, updateSurveyMetadata } from "@/lib/survey-service/metadata";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import { sendSurveyReminder } from "@/lib/survey-service/reminder";

registerBusinessRuleTestHooks();

async function createActiveSurveyForReminder() {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Reminder test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Reminder test",
    startsAt: new Date(Date.now() - 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });
  return survey;
}

test("S28 reminder: excludes submitted recipients and audits aggregate data only", async () => {
  const survey = await createActiveSurveyForReminder();
  await db.surveyRecipient.update({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
    data: { hasSubmitted: true },
  });

  const result = await sendSurveyReminder({ actorUserId: adminId, surveyId: survey.id });
  assert.equal(result.eligibleCount, 3);
  assert.equal(result.createdCount, 3);
  assert.equal(result.withoutActiveBaleLinkCount, 3);
  assert.equal(
    await db.notification.count({
      where: { surveyId: survey.id, userId, type: "SURVEY_REMINDER" },
    }),
    0,
  );
  assert.equal(
    await db.notification.count({
      where: { surveyId: survey.id, type: "SURVEY_REMINDER" },
    }),
    3,
  );

  const audit = await db.auditLog.findFirstOrThrow({
    where: { entityId: survey.id, action: "SURVEY_REMINDERS_SENT" },
  });
  assert.equal((audit.newValue as { createdCount?: number }).createdCount, 3);
  assert.equal(JSON.stringify(audit.newValue).includes(userId), false);
});

test("S28 reminder: collaborators cannot send a batch", async () => {
  const survey = await createActiveSurveyForReminder();
  await db.surveyCollaborator.create({
    data: { surveyId: survey.id, userId: managerId },
  });

  await assert.rejects(
    sendSurveyReminder({ actorUserId: managerId, surveyId: survey.id }),
    SurveyServiceError,
  );
  assert.equal(
    await db.notification.count({
      where: { surveyId: survey.id, type: "SURVEY_REMINDER" },
    }),
    0,
  );
});

test("S28 reminder: concurrent and repeat attempts create one batch", async () => {
  const survey = await createActiveSurveyForReminder();
  const attempts = await Promise.allSettled([
    sendSurveyReminder({ actorUserId: adminId, surveyId: survey.id }),
    sendSurveyReminder({ actorUserId: adminId, surveyId: survey.id }),
  ]);

  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(
    await db.notification.count({
      where: { surveyId: survey.id, type: "SURVEY_REMINDER" },
    }),
    4,
  );
  await assert.rejects(
    sendSurveyReminder({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("extendSurveyEndTime: owner can extend active survey", async () => {
  const { publishSurvey, extendSurveyEndTime } = await import(
    "@/lib/survey-service/lifecycle"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Extend test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Extend test",
    startsAt,
    endsAt,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  const newEnd = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
  await extendSurveyEndTime({
    actorUserId: adminId,
    surveyId: survey.id,
    newEndsAt: newEnd,
  });

  const updated = await db.survey.findUnique({
    where: { id: survey.id },
    select: { endsAt: true },
  });
  assert.equal(updated?.endsAt?.getTime(), newEnd.getTime());
});

test("extendSurveyEndTime: rejects non-owner", async () => {
  const { publishSurvey, extendSurveyEndTime } = await import(
    "@/lib/survey-service/lifecycle"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Extend not mine",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Extend not mine",
    startsAt,
    endsAt,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    extendSurveyEndTime({
      actorUserId: secondUserId,
      surveyId: survey.id,
      newEndsAt: new Date(endsAt.getTime() + 24 * 60 * 60 * 1000),
    }),
    SurveyServiceError,
  );
});

test("extendSurveyEndTime: rejects draft survey", async () => {
  const { extendSurveyEndTime } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Draft extend",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    extendSurveyEndTime({
      actorUserId: adminId,
      surveyId: survey.id,
      newEndsAt: new Date(),
    }),
    SurveyServiceError,
  );
});

test("extendSurveyEndTime: rejects a scheduled survey", async () => {
  const { publishSurvey, extendSurveyEndTime } = await import(
    "@/lib/survey-service/lifecycle"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Scheduled extend",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 4 * 60 * 60 * 1000);

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Scheduled extend",
    startsAt,
    endsAt,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    extendSurveyEndTime({
      actorUserId: adminId,
      surveyId: survey.id,
      newEndsAt: new Date(endsAt.getTime() + 60 * 60 * 1000),
    }),
    SurveyServiceError,
  );

  assert.equal(
    (
      await db.survey.findUnique({
        where: { id: survey.id },
        select: { endsAt: true },
      })
    )?.endsAt?.getTime(),
    endsAt.getTime(),
  );
});

test("extendSurveyEndTime: rejects new end time not after current", async () => {
  const { publishSurvey, extendSurveyEndTime } = await import(
    "@/lib/survey-service/lifecycle"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Bad extend",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Bad extend",
    startsAt,
    endsAt,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    extendSurveyEndTime({
      actorUserId: adminId,
      surveyId: survey.id,
      newEndsAt: endsAt,
    }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// Lifecycle: close
// ──────────────────────────────────────────────

test("closeSurvey: owner can close published survey", async () => {
  const { publishSurvey, closeSurvey } = await import(
    "@/lib/survey-service/lifecycle"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Close test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Close test",
    startsAt,
    endsAt,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });
  await closeSurvey({ actorUserId: adminId, surveyId: survey.id });

  const updated = await db.survey.findUnique({
    where: { id: survey.id },
    select: { state: true, closedAt: true },
  });
  assert.equal(updated?.state, SurveyState.CLOSED);
  assert.ok(updated?.closedAt !== null);
});

test("closeSurvey: rejects non-owner", async () => {
  const { publishSurvey, closeSurvey } = await import(
    "@/lib/survey-service/lifecycle"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Close not mine",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Close not mine",
    startsAt,
    endsAt,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    closeSurvey({ actorUserId: secondUserId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("closeSurvey: rejects draft survey", async () => {
  const { closeSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Close draft",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    closeSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("closeSurvey: rejects already closed survey", async () => {
  const { closeSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "Already closed",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.CLOSED,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
    },
  });

  await assert.rejects(
    closeSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// Lifecycle: archive
// ──────────────────────────────────────────────

test("archiveSurvey: owner can archive closed survey", async () => {
  const { publishSurvey, closeSurvey, archiveSurvey } = await import(
    "@/lib/survey-service/lifecycle"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Archive test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Archive test",
    startsAt,
    endsAt,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });
  await closeSurvey({ actorUserId: adminId, surveyId: survey.id });
  await archiveSurvey({ actorUserId: adminId, surveyId: survey.id });

  const updated = await db.survey.findUnique({
    where: { id: survey.id },
    select: { state: true, archivedAt: true },
  });
  assert.equal(updated?.state, SurveyState.ARCHIVED);
  assert.ok(updated?.archivedAt !== null);
});

test("archiveSurvey: can archive ended published survey", async () => {
  const { publishSurvey, archiveSurvey } = await import(
    "@/lib/survey-service/lifecycle"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Ended archive",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const startsAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Ended archive",
    startsAt,
    endsAt,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });
  await archiveSurvey({ actorUserId: adminId, surveyId: survey.id });

  const updated = await db.survey.findUnique({
    where: { id: survey.id },
    select: { state: true, archivedAt: true },
  });
  assert.equal(updated?.state, SurveyState.ARCHIVED);
  assert.ok(updated?.archivedAt !== null);
});

test("archiveSurvey: rejects draft survey", async () => {
  const { archiveSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Archive draft",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    archiveSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("archiveSurvey: rejects active published survey", async () => {
  const { publishSurvey, archiveSurvey } = await import(
    "@/lib/survey-service/lifecycle"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Active archive",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Active archive",
    startsAt,
    endsAt,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    archiveSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("archiveSurvey: rejects non-owner", async () => {
  const { publishSurvey, closeSurvey, archiveSurvey } = await import(
    "@/lib/survey-service/lifecycle"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Archive not mine",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Archive not mine",
    startsAt,
    endsAt,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });
  await closeSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    archiveSurvey({ actorUserId: secondUserId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("archiveSurvey: rejects archived survey", async () => {
  const { archiveSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "Already archived",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.ARCHIVED,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
    },
  });

  await assert.rejects(
    archiveSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});
