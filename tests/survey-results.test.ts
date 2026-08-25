import assert from "node:assert/strict";
import test from "node:test";

import {
  SurveyAudienceMode,
  SurveyIdentityMode,
  SurveyKind,
  SurveyQuestionType,
  SurveyState,
  UserRole,
} from "@prisma/client";

import { adminId, db, passwordHash, registerBusinessRuleTestHooks, secondUserId, userId } from "./business-rules-helpers";
import { removeCollaborator } from "@/lib/survey-service/collaborator";
import { closeSurvey } from "@/lib/survey-service/lifecycle";
import { getSurveyResults } from "@/lib/survey-service/results";
import { SurveyServiceError } from "@/lib/survey-service/shared";

registerBusinessRuleTestHooks();

async function createResultSurvey(input: {
  kind?: SurveyKind;
  identityMode?: SurveyIdentityMode;
  endsAt?: Date;
}) {
  return db.survey.create({
    data: {
      title: "Results survey",
      kind: input.kind ?? SurveyKind.SATISFACTION,
      identityMode: input.identityMode ?? SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      state: SurveyState.PUBLISHED,
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: input.endsAt ?? new Date(Date.now() + 60 * 60 * 1000),
      ownerId: adminId,
    },
  });
}

async function addAnonymousResponse(input: {
  surveyId: string;
  answers: Array<{
    questionId: string;
    textValue?: string;
    numericValue?: number;
    optionIds?: string[];
  }>;
  index: number;
}) {
  const participantId = `anonymous-result-user-${input.index}`;
  await db.user.create({
    data: {
      id: participantId,
      email: `${participantId}@example.test`,
      name: `Anonymous Result User ${input.index}`,
      passwordHash,
      role: UserRole.USER,
    },
  });
  await db.surveyRecipient.create({ data: { surveyId: input.surveyId, userId: participantId, hasSubmitted: true } });
  await db.surveyResponse.create({
    data: {
      surveyId: input.surveyId,
      userId: null,
      answers: {
        create: input.answers.map((answer) => ({
          questionId: answer.questionId,
          textValue: answer.textValue,
          numericValue: answer.numericValue,
          selectedOptions: answer.optionIds ? { create: answer.optionIds.map((optionId) => ({ optionId })) } : undefined,
        })),
      },
    },
  });
}

test("S24 results: only current result viewers are authorized", async () => {
  const survey = await createResultSurvey({});
  await db.surveyCollaborator.create({ data: { surveyId: survey.id, userId: secondUserId } });

  await assert.rejects(
    getSurveyResults({ actorUserId: userId, surveyId: survey.id }),
    (error: unknown) => error instanceof SurveyServiceError && error.code === "ACCESS_DENIED",
  );

  assert.equal((await getSurveyResults({ actorUserId: adminId, surveyId: survey.id })).availability, "AVAILABLE");
  assert.equal((await getSurveyResults({ actorUserId: secondUserId, surveyId: survey.id })).availability, "AVAILABLE");

  await removeCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: secondUserId });
  await assert.rejects(
    getSurveyResults({ actorUserId: secondUserId, surveyId: survey.id }),
    (error: unknown) => error instanceof SurveyServiceError && error.code === "ACCESS_DENIED",
  );
});

test("S24 results: vote embargo applies to administrators until the vote is closed", async () => {
  const survey = await createResultSurvey({ kind: SurveyKind.VOTE });
  const question = await db.surveyQuestion.create({
    data: { surveyId: survey.id, prompt: "Vote", type: SurveyQuestionType.SHORT_TEXT },
  });
  await db.surveyResponse.create({
    data: { surveyId: survey.id, userId, answers: { create: { questionId: question.id, textValue: "secret" } } },
  });

  const embargoed = await getSurveyResults({ actorUserId: adminId, surveyId: survey.id });
  assert.equal(embargoed.availability, "VOTE_EMBARGO");
  assert.equal(embargoed.participation.submittedCount, 1);
  assert.equal("questions" in embargoed, false);

  await closeSurvey({ actorUserId: adminId, surveyId: survey.id });
  const allowed = await getSurveyResults({ actorUserId: adminId, surveyId: survey.id });
  assert.equal(allowed.availability, "AVAILABLE");
});

test("S24 results: anonymous threshold hides answers from administrators", async () => {
  const survey = await createResultSurvey({ identityMode: SurveyIdentityMode.ANONYMOUS });
  const question = await db.surveyQuestion.create({
    data: { surveyId: survey.id, prompt: "Comment", type: SurveyQuestionType.LONG_TEXT },
  });
  for (let index = 0; index < 4; index += 1) {
    await addAnonymousResponse({ surveyId: survey.id, index, answers: [{ questionId: question.id, textValue: `answer ${index}` }] });
  }

  const threshold = await getSurveyResults({ actorUserId: adminId, surveyId: survey.id });
  assert.equal(threshold.availability, "ANONYMOUS_PRIVACY_THRESHOLD");
  assert.deepEqual(Object.keys(threshold.participation).sort(), ["recipientCount", "responseRate", "submittedCount"]);
  assert.equal("questions" in threshold, false);
});

test("S24 results: allowed anonymous results aggregate values and omit identities and timing", async () => {
  const survey = await createResultSurvey({ identityMode: SurveyIdentityMode.ANONYMOUS });
  const text = await db.surveyQuestion.create({
    data: { surveyId: survey.id, prompt: "Comment", type: SurveyQuestionType.LONG_TEXT, sortOrder: 1 },
  });
  const choice = await db.surveyQuestion.create({
    data: { surveyId: survey.id, prompt: "Choice", type: SurveyQuestionType.MULTIPLE_CHOICE, sortOrder: 2 },
  });
  const optionA = await db.surveyOption.create({ data: { questionId: choice.id, label: "A", sortOrder: 1 } });
  const optionB = await db.surveyOption.create({ data: { questionId: choice.id, label: "B", sortOrder: 2 } });
  const rating = await db.surveyQuestion.create({
    data: { surveyId: survey.id, prompt: "Rating", type: SurveyQuestionType.RATING, ratingMin: 1, ratingMax: 3, sortOrder: 3 },
  });

  const comments = ["zebra", "apple", "mango", "banana", "cherry"];
  for (let index = 0; index < comments.length; index += 1) {
    await addAnonymousResponse({
      surveyId: survey.id,
      index,
      answers: [
        { questionId: text.id, textValue: comments[index] },
        { questionId: choice.id, optionIds: index % 2 === 0 ? [optionA.id, optionB.id] : [optionA.id] },
        { questionId: rating.id, numericValue: (index % 3) + 1 },
      ],
    });
  }

  const results = await getSurveyResults({ actorUserId: adminId, surveyId: survey.id });
  assert.equal(results.availability, "AVAILABLE");
  if (results.availability !== "AVAILABLE") return;

  const textResult = results.questions.find((question) => question.id === text.id);
  assert.ok(textResult);
  assert.deepEqual(textResult.textAnswers.map((answer) => answer.text), [...comments].sort());
  for (const answer of textResult.textAnswers) {
    assert.deepEqual(Object.keys(answer), ["text"]);
  }

  const choiceResult = results.questions.find((question) => question.id === choice.id);
  assert.ok(choiceResult?.choices);
  assert.deepEqual(choiceResult.choices.map((option) => [option.label, option.count]), [["A", 5], ["B", 3]]);

  const ratingResult = results.questions.find((question) => question.id === rating.id);
  assert.ok(ratingResult?.rating);
  assert.deepEqual(ratingResult.rating.distribution, [{ value: 1, count: 2 }, { value: 2, count: 2 }, { value: 3, count: 1 }]);
  assert.equal(ratingResult.rating.average, 1.8);
});
