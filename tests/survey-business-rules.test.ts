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
  UserRole,
} from "@prisma/client";

import {
  adminId,
  db,
  managerId,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";
import {
  createSurveyDraft,
  deleteSurveyDraft,
  listAuthoringSurveys,
  listRespondentSurveys,
  SURVEY_DESCRIPTION_MAX_LENGTH,
  SURVEY_TITLE_MAX_LENGTH,
  updateSurveyMetadata,
} from "@/lib/survey-service/metadata";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import { deleteTeam } from "@/lib/team-service";
import {
  canCreateSurvey,
  canEditSurveyDraft,
  canManageSurveyAccess,
  canParticipate,
  canPerformLifecycleAction,
  canSendSurveyReminder,
  canViewSurveyResults,
  isSurveyManager,
} from "@/lib/survey-permissions";
import type { SurveyActor } from "@/lib/survey-permissions";
import { getSurveyDisplayState } from "@/lib/survey-status";

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

function makeActor(input: {
  role?: UserRole;
  active?: boolean;
  canCreateSurveys?: boolean;
  isOwner?: boolean;
  isCollaborator?: boolean;
  isRecipient?: boolean;
} = {}): SurveyActor {
  return {
    user: {
      role: input.role ?? UserRole.USER,
      active: input.active ?? true,
      canCreateSurveys: input.canCreateSurveys ?? false,
    },
    isOwner: input.isOwner ?? false,
    isCollaborator: input.isCollaborator ?? false,
    isRecipient: input.isRecipient ?? false,
  };
}

function makePublished(startsAt: Date | null, endsAt: Date | null) {
  return { state: SurveyState.PUBLISHED, startsAt, endsAt };
}

test("survey display state treats exactly-at-start as active and exactly-at-end as ended", () => {
  const startsAt = new Date("2026-08-16T10:00:00.000Z");
  const endsAt = new Date("2026-08-16T12:00:00.000Z");
  const beforeStart = new Date(startsAt.getTime() - 1);
  const beforeEnd = new Date(endsAt.getTime() - 1);
  const afterEnd = new Date(endsAt.getTime() + 1);

  const survey = makePublished(startsAt, endsAt);

  assert.equal(getSurveyDisplayState(survey, beforeStart), "SCHEDULED");
  assert.equal(getSurveyDisplayState(survey, startsAt), "ACTIVE");
  assert.equal(getSurveyDisplayState(survey, beforeEnd), "ACTIVE");
  assert.equal(getSurveyDisplayState(survey, endsAt), "ENDED");
  assert.equal(getSurveyDisplayState(survey, afterEnd), "ENDED");
});

test("survey display state maps persisted DRAFT, ARCHIVED, and CLOSED deterministically", () => {
  const now = new Date("2026-08-16T11:00:00.000Z");

  assert.equal(
    getSurveyDisplayState(
      { state: SurveyState.DRAFT, startsAt: null, endsAt: null },
      now,
    ),
    "DRAFT",
  );
  assert.equal(
    getSurveyDisplayState(
      { state: SurveyState.DRAFT, startsAt: now, endsAt: now },
      now,
    ),
    "DRAFT",
  );
  assert.equal(
    getSurveyDisplayState(
      { state: SurveyState.ARCHIVED, startsAt: null, endsAt: now },
      now,
    ),
    "ARCHIVED",
  );
  assert.equal(
    getSurveyDisplayState(
      { state: SurveyState.CLOSED, startsAt: null, endsAt: now },
      now,
    ),
    "ENDED",
  );
  assert.equal(
    getSurveyDisplayState(
      { state: SurveyState.CLOSED, startsAt: now, endsAt: null },
      now,
    ),
    "ENDED",
  );
});

test("survey display state is deterministic for the same inputs", () => {
  const startsAt = new Date("2026-08-16T10:00:00.000Z");
  const endsAt = new Date("2026-08-16T12:00:00.000Z");
  const now = new Date("2026-08-16T11:00:00.000Z");
  const survey = makePublished(startsAt, endsAt);

  assert.equal(getSurveyDisplayState(survey, now), "ACTIVE");
  assert.equal(getSurveyDisplayState(survey, new Date(now.getTime())), "ACTIVE");
  assert.equal(getSurveyDisplayState(survey, now), getSurveyDisplayState(survey, now));
});

test("survey display state treats a published survey with null window edges as active", () => {
  const now = new Date("2026-08-16T11:00:00.000Z");

  assert.equal(getSurveyDisplayState(makePublished(null, null), now), "ACTIVE");
  assert.equal(getSurveyDisplayState(makePublished(null, now), now), "ENDED");
  assert.equal(getSurveyDisplayState(makePublished(now, null), now), "ACTIVE");
});

test("survey create permission follows the creator-permission flag with admin override", () => {
  assert.equal(canCreateSurvey(makeActor({ role: UserRole.ADMIN }).user), true);
  assert.equal(canCreateSurvey(makeActor({ role: UserRole.ADMIN, active: false }).user), false);
  assert.equal(
    canCreateSurvey(makeActor({ role: UserRole.MANAGER, canCreateSurveys: true }).user),
    true,
  );
  assert.equal(
    canCreateSurvey(makeActor({ role: UserRole.MANAGER, canCreateSurveys: false }).user),
    false,
  );
  assert.equal(
    canCreateSurvey(makeActor({ role: UserRole.USER, canCreateSurveys: true }).user),
    true,
  );
  assert.equal(canCreateSurvey(makeActor({ active: false }).user), false);
});

test("survey management, access, and lifecycle actions require an admin or a permitted owner", () => {
  const admin = makeActor({ role: UserRole.ADMIN });
  const permittedOwner = makeActor({ isOwner: true, canCreateSurveys: true });
  const revokedOwner = makeActor({ role: UserRole.MANAGER, isOwner: true, canCreateSurveys: false });
  const inactiveOwner = makeActor({ isOwner: true, canCreateSurveys: true, active: false });
  const collaborator = makeActor({ isCollaborator: true });
  const recipient = makeActor({ isRecipient: true });

  assert.equal(isSurveyManager(admin), true);
  assert.equal(isSurveyManager(permittedOwner), true);
  assert.equal(isSurveyManager(revokedOwner), false);
  assert.equal(isSurveyManager(inactiveOwner), false);
  assert.equal(isSurveyManager(collaborator), false);
  assert.equal(isSurveyManager(recipient), false);

  for (const actor of [admin, permittedOwner, revokedOwner, inactiveOwner, collaborator, recipient]) {
    assert.equal(canManageSurveyAccess(actor), isSurveyManager(actor));
    assert.equal(canPerformLifecycleAction(actor), isSurveyManager(actor));
  }
});

test("collaborators can edit drafts and view allowed results but cannot publish or manage access", () => {
  const collaborator = makeActor({ isCollaborator: true });
  const owner = makeActor({ isOwner: true, canCreateSurveys: true });

  assert.equal(canEditSurveyDraft(collaborator, SurveyState.DRAFT), true);
  assert.equal(canViewSurveyResults(collaborator), true);
  assert.equal(canManageSurveyAccess(collaborator), false);
  assert.equal(canPerformLifecycleAction(collaborator), false);
  assert.equal(canSendSurveyReminder(collaborator, "ACTIVE"), false);

  assert.equal(canEditSurveyDraft(owner, SurveyState.DRAFT), true);
  assert.equal(canEditSurveyDraft(owner, SurveyState.PUBLISHED), false);
});

test("edit draft is restricted to drafts and to managers or active collaborators", () => {
  const admin = makeActor({ role: UserRole.ADMIN });
  const owner = makeActor({ isOwner: true, canCreateSurveys: true });
  const collaborator = makeActor({ isCollaborator: true });
  const inactiveCollaborator = makeActor({ isCollaborator: true, active: false });
  const recipient = makeActor({ isRecipient: true });
  const stranger = makeActor();

  assert.equal(canEditSurveyDraft(admin, SurveyState.DRAFT), true);
  assert.equal(canEditSurveyDraft(owner, SurveyState.DRAFT), true);
  assert.equal(canEditSurveyDraft(collaborator, SurveyState.DRAFT), true);
  assert.equal(canEditSurveyDraft(inactiveCollaborator, SurveyState.DRAFT), false);
  assert.equal(canEditSurveyDraft(recipient, SurveyState.DRAFT), false);
  assert.equal(canEditSurveyDraft(stranger, SurveyState.DRAFT), false);

  for (const state of [
    SurveyState.PUBLISHED,
    SurveyState.CLOSED,
    SurveyState.ARCHIVED,
  ]) {
    assert.equal(canEditSurveyDraft(admin, state), false);
    assert.equal(canEditSurveyDraft(owner, state), false);
    assert.equal(canEditSurveyDraft(collaborator, state), false);
  }
});

test("result viewing is limited to managers and active collaborators", () => {
  const admin = makeActor({ role: UserRole.ADMIN });
  const owner = makeActor({ isOwner: true, canCreateSurveys: true });
  const revokedOwner = makeActor({ isOwner: true, canCreateSurveys: false });
  const collaborator = makeActor({ isCollaborator: true });
  const inactiveCollaborator = makeActor({ isCollaborator: true, active: false });
  const recipient = makeActor({ isRecipient: true });
  const stranger = makeActor();

  assert.equal(canViewSurveyResults(admin), true);
  assert.equal(canViewSurveyResults(owner), true);
  assert.equal(canViewSurveyResults(revokedOwner), false);
  assert.equal(canViewSurveyResults(collaborator), true);
  assert.equal(canViewSurveyResults(inactiveCollaborator), false);
  assert.equal(canViewSurveyResults(recipient), false);
  assert.equal(canViewSurveyResults(stranger), false);
});

test("reminders require a manager and an active survey", () => {
  const admin = makeActor({ role: UserRole.ADMIN });
  const owner = makeActor({ isOwner: true, canCreateSurveys: true });
  const collaborator = makeActor({ isCollaborator: true });

  assert.equal(canSendSurveyReminder(admin, "ACTIVE"), true);
  assert.equal(canSendSurveyReminder(owner, "ACTIVE"), true);
  assert.equal(canSendSurveyReminder(admin, "SCHEDULED"), false);
  assert.equal(canSendSurveyReminder(admin, "ENDED"), false);
  assert.equal(canSendSurveyReminder(admin, "DRAFT"), false);
  assert.equal(canSendSurveyReminder(collaborator, "ACTIVE"), false);
});

test("only users with the creator permission can create a survey draft", async () => {
  await db.user.update({
    where: { id: secondUserId },
    data: { canCreateSurveys: true },
  });

  await assert.rejects(
    createSurveyDraft({
      actorUserId: userId,
      title: "Forbidden",
      kind: SurveyKind.SATISFACTION,
      identityMode: SurveyIdentityMode.NAMED,
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    createSurveyDraft({
      actorUserId: managerId,
      title: "Manager without flag",
      kind: SurveyKind.SATISFACTION,
      identityMode: SurveyIdentityMode.NAMED,
    }),
    SurveyServiceError,
  );

  const created = await createSurveyDraft({
    actorUserId: secondUserId,
    title: "  Permitted   ",
    description: "  A description  ",
    kind: SurveyKind.VOTE,
    identityMode: SurveyIdentityMode.ANONYMOUS,
  });
  assert.equal(created.state, SurveyState.DRAFT);
  assert.equal(created.title, "Permitted");
  assert.equal(created.description, "A description");
  assert.equal(created.kind, SurveyKind.VOTE);
  assert.equal(created.identityMode, SurveyIdentityMode.ANONYMOUS);
  assert.equal(created.audienceMode, SurveyAudienceMode.ALL_ACTIVE);
  assert.equal(created.startsAt, null);
  assert.equal(created.endsAt, null);

  const adminCreated = await createSurveyDraft({
    actorUserId: adminId,
    title: "Admin created",
    kind: SurveyKind.DATA_COLLECTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  assert.equal(adminCreated.state, SurveyState.DRAFT);
});

test("an inactive or missing user cannot create a survey draft", async () => {
  await db.user.update({
    where: { id: secondUserId },
    data: { canCreateSurveys: true, active: false },
  });

  await assert.rejects(
    createSurveyDraft({
      actorUserId: secondUserId,
      title: "Inactive",
      kind: SurveyKind.SATISFACTION,
      identityMode: SurveyIdentityMode.NAMED,
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    createSurveyDraft({
      actorUserId: "missing-user",
      title: "Ghost",
      kind: SurveyKind.SATISFACTION,
      identityMode: SurveyIdentityMode.NAMED,
    }),
    SurveyServiceError,
  );
});

test("metadata update and delete reject unknown surveys and inactive actors", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Draft",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    updateSurveyMetadata({
      actorUserId: adminId,
      surveyId: "missing-survey",
      title: "Ghost",
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    deleteSurveyDraft({ actorUserId: adminId, surveyId: "missing-survey" }),
    SurveyServiceError,
  );

  await db.user.update({
    where: { id: adminId },
    data: { active: false },
  });

  await assert.rejects(
    updateSurveyMetadata({
      actorUserId: adminId,
      surveyId: survey.id,
      title: "Inactive",
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    deleteSurveyDraft({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("survey metadata update validates title, description, and the time window", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Draft",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    updateSurveyMetadata({ actorUserId: adminId, surveyId: survey.id, title: "   " }),
    SurveyServiceError,
  );
  await assert.rejects(
    updateSurveyMetadata({
      actorUserId: adminId,
      surveyId: survey.id,
      title: "x".repeat(SURVEY_TITLE_MAX_LENGTH + 1),
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    updateSurveyMetadata({
      actorUserId: adminId,
      surveyId: survey.id,
      title: "Ok",
      description: "y".repeat(SURVEY_DESCRIPTION_MAX_LENGTH + 1),
    }),
    SurveyServiceError,
  );

  const startsAt = new Date("2026-08-16T10:00:00.000Z");
  await assert.rejects(
    updateSurveyMetadata({
      actorUserId: adminId,
      surveyId: survey.id,
      title: "Ok",
      startsAt,
      endsAt: startsAt,
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    updateSurveyMetadata({
      actorUserId: adminId,
      surveyId: survey.id,
      title: "Ok",
      startsAt: new Date(startsAt.getTime() + 1000),
      endsAt: startsAt,
    }),
    SurveyServiceError,
  );

  const updated = await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Updated",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 3600_000),
  });
  assert.equal(updated.title, "Updated");
  assert.equal(updated.startsAt?.getTime(), startsAt.getTime());
});

test("a collaborator can edit title, description, and schedule but not kind or identity mode", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Draft",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.surveyCollaborator.create({
    data: { surveyId: survey.id, userId: secondUserId },
  });

  const updated = await updateSurveyMetadata({
    actorUserId: secondUserId,
    surveyId: survey.id,
    title: "Edited by collaborator",
    description: "Updated description",
    startsAt: new Date("2026-08-16T10:00:00.000Z"),
    endsAt: new Date("2026-08-16T11:00:00.000Z"),
  });
  assert.equal(updated.title, "Edited by collaborator");
  assert.equal(updated.description, "Updated description");

  await assert.rejects(
    updateSurveyMetadata({
      actorUserId: secondUserId,
      surveyId: survey.id,
      title: "Still",
      kind: SurveyKind.VOTE,
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    updateSurveyMetadata({
      actorUserId: secondUserId,
      surveyId: survey.id,
      title: "Still",
      identityMode: SurveyIdentityMode.ANONYMOUS,
    }),
    SurveyServiceError,
  );
});

test("the owner or an admin can change kind and identity mode while the survey is a draft", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Draft",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const updated = await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Draft",
    kind: SurveyKind.VOTE,
    identityMode: SurveyIdentityMode.ANONYMOUS,
  });
  assert.equal(updated.kind, SurveyKind.VOTE);
  assert.equal(updated.identityMode, SurveyIdentityMode.ANONYMOUS);
});

test("published survey content cannot be edited through the metadata service", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Draft",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: survey.id },
    data: { state: SurveyState.PUBLISHED },
  });

  await assert.rejects(
    updateSurveyMetadata({ actorUserId: adminId, surveyId: survey.id, title: "Changed" }),
    SurveyServiceError,
  );
});

test("only the owner or an admin can delete a draft and non-drafts cannot be deleted", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "To delete",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.surveyCollaborator.create({
    data: { surveyId: survey.id, userId: secondUserId },
  });

  await assert.rejects(
    deleteSurveyDraft({ actorUserId: secondUserId, surveyId: survey.id }),
    SurveyServiceError,
  );
  await assert.rejects(
    deleteSurveyDraft({ actorUserId: userId, surveyId: survey.id }),
    SurveyServiceError,
  );

  await db.survey.update({
    where: { id: survey.id },
    data: { state: SurveyState.PUBLISHED },
  });
  await assert.rejects(
    deleteSurveyDraft({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );

  const draft = await createSurveyDraft({
    actorUserId: adminId,
    title: "Deletable",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await deleteSurveyDraft({ actorUserId: adminId, surveyId: draft.id });
  assert.equal(await db.survey.findUnique({ where: { id: draft.id } }), null);
});

test("metadata create, update, and delete are audited without answer data", async () => {
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Audited",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Audited 2",
  });

  await deleteSurveyDraft({ actorUserId: adminId, surveyId: survey.id });

  const logs = await db.auditLog.findMany({
    where: { entityType: "Survey", entityId: survey.id },
    orderBy: { createdAt: "asc" },
  });

  assert.deepEqual(
    logs.map((log) => log.action),
    ["SURVEY_CREATED", "SURVEY_UPDATED", "SURVEY_DELETED"],
  );
  for (const log of logs) {
    const raw = JSON.stringify(log);
    assert.ok(!raw.includes("answers"));
    assert.ok(!raw.includes("response"));
  }
});

test("list functions distinguish authoring and respondent surveys", async () => {
  const owned = await createSurveyDraft({
    actorUserId: adminId,
    title: "Owned by admin",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const collab = await createSurveyDraft({
    actorUserId: adminId,
    title: "Collaborated",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.surveyCollaborator.create({
    data: { surveyId: collab.id, userId: secondUserId },
  });

  const published = await db.survey.create({
    data: {
      title: "For recipients",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.PUBLISHED,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
    },
  });
  await db.surveyRecipient.create({
    data: { surveyId: published.id, userId, hasSubmitted: false },
  });

  const adminList = await listAuthoringSurveys({ actorUserId: adminId });
  assert.equal(adminList.length, 3);

  const collabList = await listAuthoringSurveys({ actorUserId: secondUserId });
  assert.deepEqual(
    collabList.map((survey) => survey.id),
    [collab.id],
  );

  const regularList = await listAuthoringSurveys({ actorUserId: userId });
  assert.equal(regularList.length, 0);

  const respondentList = await listRespondentSurveys({ actorUserId: userId });
  assert.equal(respondentList.length, 1);
  assert.equal(respondentList[0].id, published.id);
  assert.equal(respondentList[0].recipients[0].hasSubmitted, false);

  assert.ok(owned.id);
});

test("participation requires an active recipient and an active survey", () => {
  const recipient = makeActor({ isRecipient: true });
  const inactiveRecipient = makeActor({ isRecipient: true, active: false });
  const adminRecipient = makeActor({ role: UserRole.ADMIN, isRecipient: true });
  const adminNonRecipient = makeActor({ role: UserRole.ADMIN });
  const collaboratorNonRecipient = makeActor({ isCollaborator: true });
  const ownerNonRecipient = makeActor({ isOwner: true, canCreateSurveys: true });

  assert.equal(canParticipate(recipient, "ACTIVE"), true);
  assert.equal(canParticipate(adminRecipient, "ACTIVE"), true);
  assert.equal(canParticipate(inactiveRecipient, "ACTIVE"), false);
  assert.equal(canParticipate(recipient, "SCHEDULED"), false);
  assert.equal(canParticipate(recipient, "ENDED"), false);
  assert.equal(canParticipate(recipient, "DRAFT"), false);
  assert.equal(canParticipate(recipient, "ARCHIVED"), false);
  assert.equal(canParticipate(adminNonRecipient, "ACTIVE"), false);
  assert.equal(canParticipate(collaboratorNonRecipient, "ACTIVE"), false);
  assert.equal(canParticipate(ownerNonRecipient, "ACTIVE"), false);
});

// ── S06: Collaborator service ──

test("collaboratorCRUD: add, reject owner/duplicate/inactive, remove, cross-survey", async (t) => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Collab test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  // Owner cannot be added as collaborator.
  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: adminId }),
    SurveyServiceError,
  );

  // Add a valid collaborator.
  await addCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  // Duplicate is rejected.
  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: secondUserId }),
    SurveyServiceError,
  );

  // Verify collaborator exists.
  const collab = await db.surveyCollaborator.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId: secondUserId } },
  });
  assert.ok(collab);

  // Collaborator passes permission checks.
  const actor = await (await import("@/lib/survey-service/shared")).resolveSurveyActor(db, {
    actorUserId: secondUserId,
    surveyId: survey.id,
    ownerId: survey.ownerId,
    user: await (await import("@/lib/survey-service/shared")).loadActiveActorUser(secondUserId, db),
  });
  assert.equal(actor.isCollaborator, true);
  assert.equal(canEditSurveyDraft(actor, SurveyState.DRAFT), true);
  assert.equal(canViewSurveyResults(actor), true);

  // Remove collaborator.
  await removeCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  // Verify collaborator is removed.
  assert.equal(
    await db.surveyCollaborator.findUnique({
      where: { surveyId_userId: { surveyId: survey.id, userId: secondUserId } },
    }),
    null,
  );

  // Removed collaborator immediately loses access.
  const actorAfter = await (await import("@/lib/survey-service/shared")).resolveSurveyActor(db, {
    actorUserId: secondUserId,
    surveyId: survey.id,
    ownerId: survey.ownerId,
    user: await (await import("@/lib/survey-service/shared")).loadActiveActorUser(secondUserId, db),
  });
  assert.equal(actorAfter.isCollaborator, false);
  assert.equal(canEditSurveyDraft(actorAfter, SurveyState.DRAFT), false);
  assert.equal(canViewSurveyResults(actorAfter), false);

  // Remove non-collaborator is rejected.
  await assert.rejects(
    removeCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: userId }),
    SurveyServiceError,
  );
});

test("collaborator auth: non-admin/owner cannot manage collaborators", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Auth test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  // Regular user cannot add.
  await assert.rejects(
    addCollaborator({ actorUserId: userId, surveyId: survey.id, targetUserId: secondUserId }),
    SurveyServiceError,
  );

  // Add as admin, then collaborator cannot remove others.
  await addCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  // Collaborator cannot remove themselves or anyone else.
  await assert.rejects(
    removeCollaborator({ actorUserId: secondUserId, surveyId: survey.id, targetUserId: secondUserId }),
    SurveyServiceError,
  );
  await assert.rejects(
    removeCollaborator({ actorUserId: secondUserId, surveyId: survey.id, targetUserId: userId }),
    SurveyServiceError,
  );

  // Manager who is not owner cannot manage.
  await assert.rejects(
    addCollaborator({ actorUserId: managerId, surveyId: survey.id, targetUserId: userId }),
    SurveyServiceError,
  );
});

test("a soft-deleted actor cannot manage collaborators", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Deleted actor",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await addCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });
  await db.user.update({
    where: { id: adminId },
    data: { active: true, deletedAt: new Date() },
  });

  await assert.rejects(
    addCollaborator({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: userId,
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    removeCollaborator({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );
});

test("collaborators are audited with target user identity", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Audit test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await addCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  await removeCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  const logs = await db.auditLog.findMany({
    where: {
      entityType: "Survey",
      entityId: survey.id,
      action: { in: ["SURVEY_COLLABORATOR_ADDED", "SURVEY_COLLABORATOR_REMOVED"] },
    },
    orderBy: { createdAt: "asc" },
  });

  assert.equal(logs.length, 2);
  assert.deepEqual(
    logs.map((l) => l.action),
    ["SURVEY_COLLABORATOR_ADDED", "SURVEY_COLLABORATOR_REMOVED"],
  );

  const addedLog = logs[0];
  const addedValue = addedLog.newValue as Record<string, unknown>;
  assert.equal(addedValue.targetUserId, secondUserId);
  assert.equal(addedValue.targetUserName, "Second User");
  assert.equal(addedValue.targetUserEmail, "second@example.test");

  const removedLog = logs[1];
  const removedValue = removedLog.oldValue as Record<string, unknown>;
  assert.equal(removedValue.targetUserId, secondUserId);
  assert.equal(removedValue.targetUserName, "Second User");
  assert.equal(removedValue.targetUserEmail, "second@example.test");
});

test("a collaborator relation cannot be removed through another survey ID", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const firstSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "First survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const secondSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Second survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await addCollaborator({
    actorUserId: adminId,
    surveyId: firstSurvey.id,
    targetUserId: secondUserId,
  });

  await assert.rejects(
    removeCollaborator({
      actorUserId: adminId,
      surveyId: secondSurvey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );
  assert.ok(
    await db.surveyCollaborator.findUnique({
      where: {
        surveyId_userId: {
          surveyId: firstSurvey.id,
          userId: secondUserId,
        },
      },
    }),
  );
});

test("collaborator changes work on published surveys", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Published collab",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await db.survey.update({
    where: { id: survey.id },
    data: { state: SurveyState.PUBLISHED },
  });

  await addCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  const collab = await db.surveyCollaborator.findUnique({
    where: { surveyId_userId: { surveyId: survey.id, userId: secondUserId } },
  });
  assert.ok(collab);

  await removeCollaborator({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  assert.equal(
    await db.surveyCollaborator.findUnique({
      where: { surveyId_userId: { surveyId: survey.id, userId: secondUserId } },
    }),
    null,
  );
});

test("collaborator: inactive/deleted user cannot be added", async () => {
  const { addCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Inactive test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  // Deactivate second user.
  await db.user.update({
    where: { id: secondUserId },
    data: { active: false },
  });

  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: secondUserId }),
    SurveyServiceError,
  );

  // Re-activate and soft-delete.
  await db.user.update({
    where: { id: secondUserId },
    data: { active: true, deletedAt: new Date() },
  });

  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: secondUserId }),
    SurveyServiceError,
  );
});

test("collaborator: non-existent survey or target user is rejected", async () => {
  const { addCollaborator, removeCollaborator } = await import(
    "@/lib/survey-service/collaborator"
  );

  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: "nonexistent", targetUserId: secondUserId }),
    SurveyServiceError,
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Missing user",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addCollaborator({ actorUserId: adminId, surveyId: survey.id, targetUserId: "fake-user" }),
    SurveyServiceError,
  );

  await assert.rejects(
    removeCollaborator({ actorUserId: adminId, surveyId: "nonexistent", targetUserId: secondUserId }),
    SurveyServiceError,
  );
});
