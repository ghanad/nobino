import assert from "node:assert/strict";
import test from "node:test";

import {
  Prisma,
  SurveyAudienceMode,
  SurveyConditionOperator,
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
import { deleteTeam } from "@/lib/team-service";

registerBusinessRuleTestHooks();

test("survey authoring relations enforce unique selections and one target condition", async () => {
  const team = await db.team.create({ data: { name: "Survey Team" } });
  const survey = await db.survey.create({
    data: {
      title: "Authoring schema test",
      kind: SurveyKind.DATA_COLLECTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.TARGETED,
      ownerId: userId,
    },
  });

  await db.surveyCollaborator.create({ data: { surveyId: survey.id, userId: secondUserId } });
  await db.surveyAudienceTeam.create({ data: { surveyId: survey.id, teamId: team.id } });
  await db.surveyAudienceUser.create({ data: { surveyId: survey.id, userId: secondUserId } });

  await assert.rejects(
    db.surveyCollaborator.create({ data: { surveyId: survey.id, userId: secondUserId } }),
  );
  await assert.rejects(
    db.surveyAudienceTeam.create({ data: { surveyId: survey.id, teamId: team.id } }),
  );

  const sourceQuestion = await db.surveyQuestion.create({
    data: {
      surveyId: survey.id,
      prompt: "Source",
      type: SurveyQuestionType.SINGLE_CHOICE,
    },
  });
  const targetQuestion = await db.surveyQuestion.create({
    data: {
      surveyId: survey.id,
      prompt: "Target",
      type: SurveyQuestionType.SHORT_TEXT,
    },
  });
  const sourceOption = await db.surveyOption.create({
    data: { questionId: sourceQuestion.id, label: "Yes" },
  });

  await db.surveyQuestionCondition.create({
    data: {
      targetQuestionId: targetQuestion.id,
      sourceQuestionId: sourceQuestion.id,
      sourceOptionId: sourceOption.id,
      operator: SurveyConditionOperator.IS_SELECTED,
    },
  });

  await assert.rejects(
    db.surveyQuestionCondition.create({
      data: {
        targetQuestionId: targetQuestion.id,
        sourceQuestionId: sourceQuestion.id,
        sourceOptionId: sourceOption.id,
        operator: SurveyConditionOperator.IS_NOT_SELECTED,
      },
    }),
  );
});

test("deleting a survey cascades authoring rows and deleting a source option cascades its condition", async () => {
  const survey = await db.survey.create({
    data: {
      title: "Cascade test",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.ANONYMOUS,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: userId,
    },
  });
  const sourceQuestion = await db.surveyQuestion.create({
    data: {
      surveyId: survey.id,
      prompt: "Source",
      type: SurveyQuestionType.SINGLE_CHOICE,
    },
  });
  const targetQuestion = await db.surveyQuestion.create({
    data: {
      surveyId: survey.id,
      prompt: "Target",
      type: SurveyQuestionType.SHORT_TEXT,
    },
  });
  const sourceOption = await db.surveyOption.create({
    data: { questionId: sourceQuestion.id, label: "Yes" },
  });
  const condition = await db.surveyQuestionCondition.create({
    data: {
      targetQuestionId: targetQuestion.id,
      sourceQuestionId: sourceQuestion.id,
      sourceOptionId: sourceOption.id,
      operator: SurveyConditionOperator.IS_SELECTED,
    },
  });

  await db.surveyOption.delete({ where: { id: sourceOption.id } });
  assert.equal(await db.surveyQuestionCondition.findUnique({ where: { id: condition.id } }), null);

  await db.survey.delete({ where: { id: survey.id } });
  assert.equal(await db.surveyQuestion.count({ where: { surveyId: survey.id } }), 0);
});

test("admin team deletion removes its survey audience selection but preserves the survey", async () => {
  const team = await db.team.create({ data: { name: "Deletable Survey Team" } });
  const survey = await db.survey.create({
    data: {
      title: "Team deletion test",
      kind: SurveyKind.DATA_COLLECTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.TARGETED,
      ownerId: userId,
      audienceTeams: { create: { teamId: team.id } },
    },
  });

  await deleteTeam({ adminId, teamId: team.id });

  assert.equal(
    await db.surveyAudienceTeam.findUnique({
      where: { surveyId_teamId: { surveyId: survey.id, teamId: team.id } },
    }),
    null,
  );
  assert.ok(await db.survey.findUnique({ where: { id: survey.id } }));
});

async function createSurvey(overrides: {
  identityMode?: SurveyIdentityMode;
  title?: string;
} = {}) {
  return db.survey.create({
    data: {
      title: overrides.title ?? "Participation schema test",
      kind: SurveyKind.DATA_COLLECTION,
      state: SurveyState.PUBLISHED,
      identityMode: overrides.identityMode ?? SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: userId,
    },
  });
}

test("only one survey recipient exists per survey/user", async () => {
  const survey = await createSurvey();

  await db.surveyRecipient.create({
    data: { surveyId: survey.id, userId, hasSubmitted: true },
  });
  await assert.rejects(
    db.surveyRecipient.create({ data: { surveyId: survey.id, userId } }),
  );

  const count = await db.surveyRecipient.count({
    where: { surveyId: survey.id, userId },
  });
  assert.equal(count, 1);
});

test("only one survey draft exists per survey/user", async () => {
  const survey = await createSurvey();

  await db.surveyDraft.create({
    data: { surveyId: survey.id, userId, answers: { draft: "in progress" } },
  });
  await assert.rejects(
    db.surveyDraft.create({
      data: { surveyId: survey.id, userId, answers: { other: true } },
    }),
  );

  const count = await db.surveyDraft.count({
    where: { surveyId: survey.id, userId },
  });
  assert.equal(count, 1);
});

test("only one survey answer exists per response/question", async () => {
  const survey = await createSurvey();
  const question = await db.surveyQuestion.create({
    data: { surveyId: survey.id, prompt: "Feedback", type: SurveyQuestionType.SHORT_TEXT },
  });
  const response = await db.surveyResponse.create({ data: { surveyId: survey.id, userId } });

  await db.surveyAnswer.create({
    data: { responseId: response.id, questionId: question.id, textValue: "Great" },
  });
  await assert.rejects(
    db.surveyAnswer.create({
      data: { responseId: response.id, questionId: question.id, textValue: "Again" },
    }),
  );

  const count = await db.surveyAnswer.count({
    where: { responseId: response.id, questionId: question.id },
  });
  assert.equal(count, 1);
});

test("duplicate survey answer option rows are rejected", async () => {
  const survey = await createSurvey();
  const question = await db.surveyQuestion.create({
    data: {
      surveyId: survey.id,
      prompt: "Pick",
      type: SurveyQuestionType.MULTIPLE_CHOICE,
    },
  });
  const option = await db.surveyOption.create({
    data: { questionId: question.id, label: "A" },
  });
  const response = await db.surveyResponse.create({ data: { surveyId: survey.id, userId } });
  const answer = await db.surveyAnswer.create({
    data: { responseId: response.id, questionId: question.id },
  });

  await db.surveyAnswerOption.create({
    data: { answerId: answer.id, optionId: option.id },
  });
  await assert.rejects(
    db.surveyAnswerOption.create({
      data: { answerId: answer.id, optionId: option.id },
    }),
  );

  const count = await db.surveyAnswerOption.count({ where: { answerId: answer.id } });
  assert.equal(count, 1);
});

test("an anonymous response can be stored with userId = null", async () => {
  const survey = await createSurvey({ identityMode: SurveyIdentityMode.ANONYMOUS });

  const response = await db.surveyResponse.create({ data: { surveyId: survey.id, userId: null } });

  assert.equal(response.userId, null);
  const stored = await db.surveyResponse.findUniqueOrThrow({ where: { id: response.id } });
  assert.equal(stored.userId, null);
});

test("an anonymous response has no recipient relation or identity-bearing key", async () => {
  const survey = await createSurvey({ identityMode: SurveyIdentityMode.ANONYMOUS });
  const response = await db.surveyResponse.create({ data: { surveyId: survey.id, userId: null } });

  const responseKeys = Object.keys(response);
  assert.ok(!responseKeys.includes("recipientId"));
  assert.ok(!responseKeys.includes("anonymousKey"));
  assert.ok(!responseKeys.includes("responseKey"));

  const models = Prisma.dmmf.datamodel.models;
  const responseModel = models.find((model) => model.name === "SurveyResponse");
  const recipientModel = models.find((model) => model.name === "SurveyRecipient");
  assert.ok(responseModel);
  assert.ok(recipientModel);

  const responseRelations = responseModel.fields.filter((field) => field.kind === "object");
  assert.ok(!responseRelations.some((field) => field.type === "SurveyRecipient"));

  const recipientFields = recipientModel.fields.map((field) => field.name);
  assert.ok(!recipientFields.includes("responseId"));
  assert.ok(!recipientFields.includes("submittedAt"));
  assert.ok(!recipientFields.includes("completedAt"));
  const recipientRelations = recipientModel.fields.filter((field) => field.kind === "object");
  assert.ok(!recipientRelations.some((field) => field.type === "SurveyResponse"));
});

test("deleting a response cascades its answers and selected options", async () => {
  const survey = await createSurvey();
  const question = await db.surveyQuestion.create({
    data: {
      surveyId: survey.id,
      prompt: "Pick",
      type: SurveyQuestionType.MULTIPLE_CHOICE,
    },
  });
  const option = await db.surveyOption.create({
    data: { questionId: question.id, label: "A" },
  });
  const response = await db.surveyResponse.create({ data: { surveyId: survey.id, userId } });
  const answer = await db.surveyAnswer.create({
    data: { responseId: response.id, questionId: question.id, textValue: "x" },
  });
  await db.surveyAnswerOption.create({
    data: { answerId: answer.id, optionId: option.id },
  });

  await db.surveyResponse.delete({ where: { id: response.id } });

  assert.equal(await db.surveyAnswer.count({ where: { responseId: response.id } }), 0);
  assert.equal(await db.surveyAnswerOption.count({ where: { answerId: answer.id } }), 0);
});

test("existing answers prevent unsafe deletion of referenced questions and options", async () => {
  const survey = await createSurvey();
  const question = await db.surveyQuestion.create({
    data: {
      surveyId: survey.id,
      prompt: "Pick",
      type: SurveyQuestionType.MULTIPLE_CHOICE,
    },
  });
  const option = await db.surveyOption.create({
    data: { questionId: question.id, label: "A" },
  });
  const response = await db.surveyResponse.create({ data: { surveyId: survey.id, userId } });
  const answer = await db.surveyAnswer.create({
    data: { responseId: response.id, questionId: question.id },
  });
  await db.surveyAnswerOption.create({
    data: { answerId: answer.id, optionId: option.id },
  });

  await assert.rejects(db.surveyQuestion.delete({ where: { id: question.id } }));
  await assert.rejects(db.surveyOption.delete({ where: { id: option.id } }));

  assert.ok(await db.surveyQuestion.findUnique({ where: { id: question.id } }));
  assert.ok(await db.surveyOption.findUnique({ where: { id: option.id } }));
});

test("a notification can optionally reference a survey and deletion is isolated", async () => {
  const survey = await createSurvey();
  const withSurvey = await db.notification.create({
    data: {
      userId,
      surveyId: survey.id,
      type: "SURVEY_INVITATION",
      title: "Invite",
      body: "Please respond",
    },
  });
  assert.equal(withSurvey.surveyId, survey.id);

  const withoutSurvey = await db.notification.create({
    data: {
      userId,
      type: "RESERVATION_UPDATED",
      title: "No survey",
      body: "Unrelated",
    },
  });
  assert.equal(withoutSurvey.surveyId, null);

  await db.notification.delete({ where: { id: withSurvey.id } });
  assert.ok(await db.survey.findUnique({ where: { id: survey.id } }));

  await db.survey.delete({ where: { id: survey.id } });
  const preserved = await db.notification.findUniqueOrThrow({
    where: { id: withoutSurvey.id },
  });
  assert.equal(preserved.surveyId, null);
});
