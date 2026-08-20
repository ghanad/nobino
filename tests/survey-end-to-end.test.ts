import assert from "node:assert/strict";
import test from "node:test";

import {
  SurveyIdentityMode,
  SurveyKind,
  SurveyQuestionType,
  UserRole,
} from "@prisma/client";

import { exportSurveyResults } from "@/lib/survey-service/export-results";
import { closeSurvey, publishSurvey } from "@/lib/survey-service/lifecycle";
import { createSurveyDraft, updateSurveyMetadata } from "@/lib/survey-service/metadata";
import { addQuestion } from "@/lib/survey-service/questions";
import { sendSurveyReminder } from "@/lib/survey-service/reminder";
import { getSurveyResults } from "@/lib/survey-service/results";
import { submitAnonymousResponse, submitNamedResponse } from "@/lib/survey-service/submit-response";
import {
  adminId,
  db,
  passwordHash,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

async function createActiveSurvey(input: {
  identityMode: SurveyIdentityMode;
  kind: SurveyKind;
  title: string;
}) {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: input.title,
    kind: input.kind,
    identityMode: input.identityMode,
  });
  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: input.title,
    startsAt: new Date(Date.now() - 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const question = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "نظر شما چیست؟",
    type: SurveyQuestionType.SHORT_TEXT,
    required: true,
  });
  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });
  return { survey, question };
}

test("S29 end-to-end: named satisfaction publishes, reminds, submits, and exports", async () => {
  const { survey, question } = await createActiveSurvey({
    identityMode: SurveyIdentityMode.NAMED,
    kind: SurveyKind.SATISFACTION,
    title: "رضایت نام‌دار",
  });

  const reminder = await sendSurveyReminder({ actorUserId: adminId, surveyId: survey.id });
  assert.equal(reminder.eligibleCount, 4);
  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: { [question.id]: "عالی" },
  });

  const results = await getSurveyResults({ actorUserId: adminId, surveyId: survey.id });
  assert.equal(results.availability, "AVAILABLE");
  const file = await exportSurveyResults({ actorUserId: adminId, surveyId: survey.id });
  assert.match(file.filename, /\.xlsx$/);
  assert.ok(file.content.byteLength > 0);
});

test("S29 end-to-end: anonymous data responses stay unlinked through results and export", async () => {
  const anonymousParticipantIds = [
    userId,
    secondUserId,
    "anonymous-e2e-user-1",
    "anonymous-e2e-user-2",
    "anonymous-e2e-user-3",
  ];
  await db.user.createMany({
    data: anonymousParticipantIds.slice(2).map((id) => ({
      id,
      email: `${id}@example.test`,
      name: id,
      passwordHash,
      role: UserRole.USER,
    })),
  });
  const { survey, question } = await createActiveSurvey({
    identityMode: SurveyIdentityMode.ANONYMOUS,
    kind: SurveyKind.DATA_COLLECTION,
    title: "داده ناشناس",
  });
  for (const actorUserId of anonymousParticipantIds) {
    await submitAnonymousResponse({
      actorUserId,
      surveyId: survey.id,
      answers: { [question.id]: "پاسخ ناشناس" },
    });
  }

  const responses = await db.surveyResponse.findMany({ where: { surveyId: survey.id } });
  assert.equal(responses.length, 5);
  assert.ok(responses.every((response) => response.userId === null));
  const results = await getSurveyResults({ actorUserId: adminId, surveyId: survey.id });
  assert.equal(results.availability, "AVAILABLE");
  const file = await exportSurveyResults({ actorUserId: adminId, surveyId: survey.id });
  assert.ok(file.content.byteLength > 0);
});

test("S29 end-to-end: vote remains embargoed until close, then exports", async () => {
  const { survey, question } = await createActiveSurvey({
    identityMode: SurveyIdentityMode.NAMED,
    kind: SurveyKind.VOTE,
    title: "رأی‌گیری",
  });
  await sendSurveyReminder({ actorUserId: adminId, surveyId: survey.id });
  await submitNamedResponse({
    actorUserId: userId,
    surveyId: survey.id,
    answers: { [question.id]: "گزینه الف" },
  });
  const embargoed = await getSurveyResults({ actorUserId: adminId, surveyId: survey.id });
  assert.equal(embargoed.availability, "VOTE_EMBARGO");

  await closeSurvey({ actorUserId: adminId, surveyId: survey.id });
  const file = await exportSurveyResults({ actorUserId: adminId, surveyId: survey.id });
  assert.ok(file.content.byteLength > 0);
});
