import assert from "node:assert/strict";
import test from "node:test";

import {
  SurveyAudienceMode,
  SurveyIdentityMode,
  SurveyKind,
  SurveyQuestionType,
  SurveyState,
} from "@prisma/client";

import {
  adminId,
  db,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";
import { createSurveyDraft, updateSurveyMetadata } from "@/lib/survey-service/metadata";
import { getSurveyForRecipient } from "@/lib/survey-service/recipient";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import { addQuestion, addOption } from "@/lib/survey-service/questions";
import { publishSurvey } from "@/lib/survey-service/lifecycle";
import { setAudienceMode, addAudienceUser } from "@/lib/survey-service/audience";

registerBusinessRuleTestHooks();

test("S18 recipient: recipient can view survey details", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Test survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Test survey",
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  const q2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q2",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q2.id,
    label: "A",
  });

  await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q2.id,
    label: "B",
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  const data = await getSurveyForRecipient(survey.id, userId);

  assert.equal(data.id, survey.id);
  assert.equal(data.title, "Test survey");
  assert.equal(data.questions.length, 2);
  assert.equal(data.questions[0].prompt, "Q1");
  assert.equal(data.questions[1].prompt, "Q2");
  assert.equal(data.questions[1].options.length, 2);
  assert.equal(data.hasSubmitted, false);
  assert.equal(data.displayState, "ACTIVE");
  assert.equal(data.identityMode, "NAMED");
  assert.equal(data.kind, "SATISFACTION");
});

test("S18 recipient: non-recipient cannot view survey details", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Private survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Private survey",
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: adminId,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await assert.rejects(
    () => getSurveyForRecipient(survey.id, userId),
    SurveyServiceError,
  );
});

test("S18 recipient: admin can view any survey even when not a recipient", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Admin survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Admin survey",
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: adminId,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  const data = await getSurveyForRecipient(survey.id, adminId);
  assert.equal(data.id, survey.id);
  assert.equal(data.title, "Admin survey");
});

test("S18 recipient: participation count is only visible to managers", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Count test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Count test",
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  const adminData = await getSurveyForRecipient(survey.id, adminId);
  assert.equal(typeof adminData.participationCount, "number");

  const userData = await getSurveyForRecipient(survey.id, userId);
  assert.equal(userData.participationCount, null);
});

test("S18 recipient: hasSubmitted reflects recipient status", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Submission test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Submission test",
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  const dataBefore = await getSurveyForRecipient(survey.id, userId);
  assert.equal(dataBefore.hasSubmitted, false);

  await db.surveyRecipient.update({
    where: { surveyId_userId: { surveyId: survey.id, userId } },
    data: { hasSubmitted: true },
  });

  const dataAfter = await getSurveyForRecipient(survey.id, userId);
  assert.equal(dataAfter.hasSubmitted, true);
});

test("S18 recipient: manager can view survey even when not a recipient", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Manager view",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Manager view",
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  const data = await getSurveyForRecipient(survey.id, adminId);
  assert.equal(data.id, survey.id);
  assert.equal(data.title, "Manager view");
});

test("S18 recipient: invalid survey ID throws error", async () => {
  await assert.rejects(
    () => getSurveyForRecipient("nonexistent-id", userId),
    SurveyServiceError,
  );
});

test("S18 recipient: cross-survey ID cannot reveal another survey", async () => {
  const survey1 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Survey One",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey1.id,
    title: "Survey One",
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: survey1.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey1.id });

  const survey2 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Survey Two",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey2.id,
    title: "Survey Two",
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: survey2.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey2.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey2.id,
    targetUserId: secondUserId,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey2.id });

  const data1 = await getSurveyForRecipient(survey1.id, userId);
  assert.equal(data1.id, survey1.id);

  await assert.rejects(
    () => getSurveyForRecipient(survey2.id, userId),
    SurveyServiceError,
  );
});
