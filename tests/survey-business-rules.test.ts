import assert from "node:assert/strict";
import test from "node:test";

import {
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
