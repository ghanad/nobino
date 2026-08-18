import assert from "node:assert/strict";
import test from "node:test";

import { SurveyAudienceMode, SurveyIdentityMode, SurveyKind, SurveyQuestionType, SurveyState } from "@prisma/client";

import {
  adminId,
  db,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";
import {
  createSurveyDraft,
  listAuthoringSurveys,
  listRespondentSurveys,
  updateSurveyMetadata,
} from "@/lib/survey-service/metadata";
import { groupSurveyNavigation } from "@/lib/survey-list";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import { getSurveyDisplayState } from "@/lib/survey-status";

registerBusinessRuleTestHooks();

test("survey list page: respondent survey grouping respects display state and submission", async () => {
  const { publishSurvey } = await import(
    "@/lib/survey-service/lifecycle"
  );
  const { addQuestion } = await import("@/lib/survey-service/questions");

  // Create a survey that is ACTIVE now
  const activeSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Active survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: activeSurvey.id,
    title: "Active survey",
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: activeSurvey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: activeSurvey.id });

  // Create a survey that is ENDED
  const endedSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Ended survey",
    kind: SurveyKind.DATA_COLLECTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: endedSurvey.id,
    title: "Ended survey",
    startsAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: endedSurvey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: endedSurvey.id });

  // Create a survey that is SCHEDULED (not yet started)
  const scheduledSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Scheduled survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: scheduledSurvey.id,
    title: "Scheduled survey",
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: scheduledSurvey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: scheduledSurvey.id });

  // Fetch respondent surveys - publishSurvey with ALL_ACTIVE mode already
  // created recipients for all active users including userId
  const respondentList = await listRespondentSurveys({ actorUserId: userId });

  const grouped = groupSurveyNavigation({
    respondentSurveys: respondentList,
    authoringSurveys: [],
    now: new Date(),
  });

  assert.equal(grouped.availableToAnswer.length, 1);
  assert.equal(grouped.availableToAnswer[0].id, activeSurvey.id);
  assert.equal(grouped.completed.length, 0);
  assert.equal(grouped.ended.length, 1);
  assert.equal(grouped.ended[0].id, endedSurvey.id);

  // Now mark the active survey as completed
  await db.surveyRecipient.update({
    where: { surveyId_userId: { surveyId: activeSurvey.id, userId } },
    data: { hasSubmitted: true },
  });

  const updatedRespondentList = await listRespondentSurveys({
    actorUserId: userId,
  });

  const updatedGrouped = groupSurveyNavigation({
    respondentSurveys: updatedRespondentList,
    authoringSurveys: [],
    now: new Date(),
  });

  assert.equal(updatedGrouped.availableToAnswer.length, 0);
  assert.equal(updatedGrouped.completed.length, 1);
  assert.equal(updatedGrouped.completed[0].id, activeSurvey.id);
});

test("survey list page: scheduled survey does not appear in available to answer", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");
  const { addQuestion } = await import("@/lib/survey-service/questions");

  // Create a survey that starts in the future
  const scheduledSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Future survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: scheduledSurvey.id,
    title: "Future survey",
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: scheduledSurvey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: scheduledSurvey.id });

  // publishSurvey with ALL_ACTIVE mode already created recipients
  const respondentList = await listRespondentSurveys({ actorUserId: userId });
  const now = new Date();
  const displayState = getSurveyDisplayState(respondentList[0], now);
  assert.equal(displayState, "SCHEDULED");

  const grouped = groupSurveyNavigation({
    respondentSurveys: respondentList,
    authoringSurveys: [],
    now,
  });

  assert.equal(grouped.availableToAnswer.length, 0);
});

test("survey list page: management entries remain visible when the actor is also a recipient", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");
  const { addQuestion } = await import("@/lib/survey-service/questions");
  const { setAudienceMode, addAudienceUser } = await import(
    "@/lib/survey-service/audience"
  );

  // Create a survey owned by admin, user IS a recipient (TARGETED with user)
  const recipientSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Recipient survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: recipientSurvey.id,
    title: "Recipient survey",
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: recipientSurvey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await setAudienceMode({
    actorUserId: adminId,
    surveyId: recipientSurvey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: recipientSurvey.id,
    targetUserId: userId,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: recipientSurvey.id });

  // Create a survey where user is NOT a recipient (TARGETED with only admin)
  const managementOnlySurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Management only",
    kind: SurveyKind.DATA_COLLECTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: managementOnlySurvey.id,
    title: "Management only",
    startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });

  await addQuestion({
    actorUserId: adminId,
    surveyId: managementOnlySurvey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await setAudienceMode({
    actorUserId: adminId,
    surveyId: managementOnlySurvey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: managementOnlySurvey.id,
    targetUserId: adminId,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: managementOnlySurvey.id });

  // Admin sees both in authoring list
  const adminAuthoring = await listAuthoringSurveys({ actorUserId: adminId });
  assert.ok(adminAuthoring.some((s) => s.id === recipientSurvey.id));
  assert.ok(adminAuthoring.some((s) => s.id === managementOnlySurvey.id));

  // Respondent list for user includes only the one they're a recipient of
  const respondentList = await listRespondentSurveys({ actorUserId: userId });

  assert.ok(respondentList.some((s) => s.id === recipientSurvey.id));
  assert.equal(
    respondentList.some((s) => s.id === managementOnlySurvey.id),
    false,
  );

  const grouped = groupSurveyNavigation({
    respondentSurveys: await listRespondentSurveys({ actorUserId: adminId }),
    authoringSurveys: adminAuthoring,
    now: new Date(),
  });

  assert.ok(grouped.managed.some((s) => s.id === recipientSurvey.id));
  assert.ok(grouped.managed.some((s) => s.id === managementOnlySurvey.id));
});

test("survey list page: non-admin non-creator user sees only respondent surveys", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");
  const { addQuestion } = await import("@/lib/survey-service/questions");
  const { setAudienceMode, addAudienceUser } = await import(
    "@/lib/survey-service/audience"
  );

  // Create a survey where user is a recipient
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Regular user survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Regular user survey",
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
    targetUserId: userId,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  // Regular user (non-admin, non-creator) should not see any authoring surveys
  const authoringList = await listAuthoringSurveys({ actorUserId: userId });
  assert.equal(authoringList.length, 0);

  // But should see the respondent survey
  const respondentList = await listRespondentSurveys({ actorUserId: userId });
  assert.ok(respondentList.some((s) => s.id === survey.id));
});

