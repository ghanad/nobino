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
import { groupSurveyNavigation } from "@/lib/survey-list";
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

test("audience: set audience mode to targeted", async () => {
  const { setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Audience mode test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  assert.equal(survey.audienceMode, SurveyAudienceMode.ALL_ACTIVE);

  const result = await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });

  assert.equal(result.audienceMode, SurveyAudienceMode.TARGETED);

  const reloaded = await db.survey.findUnique({
    where: { id: survey.id },
    select: { audienceMode: true },
  });
  assert.equal(reloaded?.audienceMode, SurveyAudienceMode.TARGETED);

  const logs = await db.auditLog.findMany({
    where: {
      entityType: "Survey",
      entityId: survey.id,
      action: "SURVEY_AUDIENCE_MODE_CHANGED",
    },
  });
  assert.equal(logs.length, 1);
});

test("audience: only owner/admin can set audience mode", async () => {
  const { setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Audience mode auth",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    setAudienceMode({
      actorUserId: userId,
      surveyId: survey.id,
      audienceMode: SurveyAudienceMode.TARGETED,
    }),
    SurveyServiceError,
  );

  await db.user.update({
    where: { id: userId },
    data: { canCreateSurveys: true },
  });

  const survey2 = await createSurveyDraft({
    actorUserId: userId,
    title: "Owner test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await setAudienceMode({
    actorUserId: userId,
    surveyId: survey2.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });

  assert.equal(
    (await db.survey.findUnique({ where: { id: survey2.id }, select: { audienceMode: true } }))
      ?.audienceMode,
    SurveyAudienceMode.TARGETED,
  );
});

test("audience: collaborator cannot change audience mode", async () => {
  const { setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Collab audience",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await db.surveyCollaborator.create({
    data: { surveyId: survey.id, userId: userId },
  });

  await assert.rejects(
    setAudienceMode({
      actorUserId: userId,
      surveyId: survey.id,
      audienceMode: SurveyAudienceMode.TARGETED,
    }),
    SurveyServiceError,
  );
});

test("audience: cannot change audience mode on published survey", async () => {
  const { setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Published mode",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await db.survey.update({
    where: { id: survey.id },
    data: { state: SurveyState.PUBLISHED },
  });

  await assert.rejects(
    setAudienceMode({
      actorUserId: adminId,
      surveyId: survey.id,
      audienceMode: SurveyAudienceMode.TARGETED,
    }),
    SurveyServiceError,
  );
});

test("audience: add and remove team", async () => {
  const { addAudienceTeam, removeAudienceTeam } = await import(
    "@/lib/survey-service/audience"
  );

  const team = await db.team.create({ data: { name: "Audience Test Team" } });
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Team audience",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: survey.id },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: team.id,
  });

  const selections = await db.surveyAudienceTeam.findMany({
    where: { surveyId: survey.id },
  });
  assert.equal(selections.length, 1);
  assert.equal(selections[0].teamId, team.id);

  await removeAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: team.id,
  });

  assert.equal(
    await db.surveyAudienceTeam.count({ where: { surveyId: survey.id } }),
    0,
  );
});

test("audience: duplicate team rejected", async () => {
  const { addAudienceTeam } = await import(
    "@/lib/survey-service/audience"
  );

  const team = await db.team.create({ data: { name: "Duplicate Team" } });
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Duplicate team",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: survey.id },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: team.id,
  });

  await assert.rejects(
    addAudienceTeam({
      actorUserId: adminId,
      surveyId: survey.id,
      teamId: team.id,
    }),
    SurveyServiceError,
  );
});

test("audience: non-existent team or none-added team removal rejected", async () => {
  const { addAudienceTeam, removeAudienceTeam } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Missing team",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: survey.id },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await assert.rejects(
    addAudienceTeam({
      actorUserId: adminId,
      surveyId: survey.id,
      teamId: "nonexistent-team",
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    removeAudienceTeam({
      actorUserId: adminId,
      surveyId: survey.id,
      teamId: "nonexistent-team",
    }),
    SurveyServiceError,
  );

  const team = await db.team.create({ data: { name: "Not Added Team" } });

  await assert.rejects(
    removeAudienceTeam({
      actorUserId: adminId,
      surveyId: survey.id,
      teamId: team.id,
    }),
    SurveyServiceError,
  );
});

test("audience: add and remove explicit user", async () => {
  const { addAudienceUser, removeAudienceUser } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "User audience",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: survey.id },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  const selections = await db.surveyAudienceUser.findMany({
    where: { surveyId: survey.id },
  });
  assert.equal(selections.length, 1);
  assert.equal(selections[0].userId, secondUserId);

  await removeAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  assert.equal(
    await db.surveyAudienceUser.count({ where: { surveyId: survey.id } }),
    0,
  );
});

test("audience: duplicate and inactive user rejected", async () => {
  const { addAudienceUser } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Duplicate user",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: survey.id },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });

  await assert.rejects(
    addAudienceUser({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );

  await db.user.update({
    where: { id: secondUserId },
    data: { active: false },
  });

  await assert.rejects(
    addAudienceUser({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );
});

test("audience: cross-survey ID rejected", async () => {
  const { addAudienceTeam, removeAudienceTeam, addAudienceUser, removeAudienceUser } =
    await import("@/lib/survey-service/audience");

  const team = await db.team.create({ data: { name: "Cross Survey Team" } });
  const survey1 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Cross survey 1",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const survey2 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Cross survey 2",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.updateMany({
    where: { id: { in: [survey1.id, survey2.id] } },
    data: { audienceMode: SurveyAudienceMode.TARGETED },
  });

  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey1.id,
    teamId: team.id,
  });

  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey1.id,
    targetUserId: secondUserId,
  });

  await assert.rejects(
    removeAudienceTeam({
      actorUserId: adminId,
      surveyId: survey2.id,
      teamId: team.id,
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    removeAudienceUser({
      actorUserId: adminId,
      surveyId: survey2.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );

  assert.equal(
    await db.surveyAudienceTeam.count({ where: { surveyId: survey1.id } }),
    1,
  );
  assert.equal(
    await db.surveyAudienceUser.count({ where: { surveyId: survey1.id } }),
    1,
  );
});

test("audience: targeted selections require targeted mode", async () => {
  const { addAudienceTeam, addAudienceUser } = await import(
    "@/lib/survey-service/audience"
  );

  const team = await db.team.create({ data: { name: "Wrong Mode Team" } });
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Wrong audience mode",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addAudienceTeam({
      actorUserId: adminId,
      surveyId: survey.id,
      teamId: team.id,
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    addAudienceUser({
      actorUserId: adminId,
      surveyId: survey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );

  assert.equal(
    await db.surveyAudienceTeam.count({ where: { surveyId: survey.id } }),
    0,
  );
  assert.equal(
    await db.surveyAudienceUser.count({ where: { surveyId: survey.id } }),
    0,
  );
});

test("audience: targeted preview deduplicates and excludes inactive or deleted users", async () => {
  const { addAudienceTeam, addAudienceUser, previewAudience, setAudienceMode } =
    await import("@/lib/survey-service/audience");

  const firstTeam = await db.team.create({ data: { name: "Preview Team A" } });
  const secondTeam = await db.team.create({ data: { name: "Preview Team B" } });
  await db.teamMembership.createMany({
    data: [
      { teamId: firstTeam.id, userId },
      { teamId: firstTeam.id, userId: secondUserId },
      { teamId: secondTeam.id, userId: secondUserId },
      { teamId: secondTeam.id, userId: managerId },
    ],
  });

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Targeted preview",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: firstTeam.id,
  });
  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: secondTeam.id,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: managerId,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: adminId,
  });

  await db.user.update({
    where: { id: secondUserId },
    data: { active: false },
  });
  await db.user.update({
    where: { id: managerId },
    data: { deletedAt: new Date() },
  });

  const preview = await previewAudience({
    actorUserId: adminId,
    surveyId: survey.id,
  });

  assert.deepEqual(
    new Set(preview.users.map((previewUser) => previewUser.id)),
    new Set([adminId, userId]),
  );
  assert.equal(preview.totalUniqueUsers, 2);
  assert.deepEqual(
    preview.teamSources.map((source) => [
      source.teamName,
      source.activeMemberCount,
    ]),
    [
      ["Preview Team A", 1],
      ["Preview Team B", 0],
    ],
  );
  assert.equal(preview.explicitUserCount, 1);
  assert.equal(preview.hasEffectiveAudience, true);
  assert.equal(
    await db.surveyRecipient.count({ where: { surveyId: survey.id } }),
    0,
  );
});

test("audience: preview represents an empty targeted audience clearly", async () => {
  const { previewAudience, setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Empty targeted preview",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });

  const preview = await previewAudience({
    actorUserId: adminId,
    surveyId: survey.id,
  });

  assert.deepEqual(preview.users, []);
  assert.equal(preview.totalUniqueUsers, 0);
  assert.deepEqual(preview.teamSources, []);
  assert.equal(preview.explicitUserCount, 0);
  assert.equal(preview.hasEffectiveAudience, false);
});

test("audience: all-active preview returns only active non-deleted users", async () => {
  const { previewAudience } = await import(
    "@/lib/survey-service/audience"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "All active preview",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.user.update({
    where: { id: userId },
    data: { active: false },
  });
  await db.user.update({
    where: { id: secondUserId },
    data: { deletedAt: new Date() },
  });

  const preview = await previewAudience({
    actorUserId: adminId,
    surveyId: survey.id,
  });

  assert.deepEqual(
    new Set(preview.users.map((previewUser) => previewUser.id)),
    new Set([adminId, managerId]),
  );
  assert.equal(preview.totalUniqueUsers, 2);
  assert.equal(preview.hasEffectiveAudience, true);
});

test("audience: audit payloads use only IDs and counts", async () => {
  const {
    addAudienceTeam,
    addAudienceUser,
    removeAudienceTeam,
    removeAudienceUser,
    setAudienceMode,
  } = await import("@/lib/survey-service/audience");

  const team = await db.team.create({ data: { name: "Audit Audience Team" } });
  await db.teamMembership.create({
    data: { teamId: team.id, userId: secondUserId },
  });
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Audience audit payload",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: team.id,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });
  await removeAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: secondUserId,
  });
  await removeAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: team.id,
  });

  const logs = await db.auditLog.findMany({
    where: {
      entityType: "Survey",
      entityId: survey.id,
      action: { startsWith: "SURVEY_AUDIENCE_" },
    },
    orderBy: { createdAt: "asc" },
  });
  const serializedPayloads = JSON.stringify(
    logs.map((log) => ({ oldValue: log.oldValue, newValue: log.newValue })),
  );

  assert.equal(serializedPayloads.includes("Audit Audience Team"), false);
  assert.equal(serializedPayloads.includes("second@example.test"), false);
  assert.equal(serializedPayloads.includes("Second User"), false);
  assert.equal(serializedPayloads.includes(team.id), true);
  assert.equal(serializedPayloads.includes(secondUserId), true);
  assert.equal(serializedPayloads.includes("activeMemberCount"), true);
});

test("audience: collaborators cannot change targeted selections", async () => {
  const { addAudienceTeam, addAudienceUser, setAudienceMode } = await import(
    "@/lib/survey-service/audience"
  );

  const team = await db.team.create({ data: { name: "Collaborator Audience Team" } });
  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Collaborator targeted access",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await db.surveyCollaborator.create({
    data: { surveyId: survey.id, userId },
  });

  await assert.rejects(
    addAudienceTeam({
      actorUserId: userId,
      surveyId: survey.id,
      teamId: team.id,
    }),
    SurveyServiceError,
  );
  await assert.rejects(
    addAudienceUser({
      actorUserId: userId,
      surveyId: survey.id,
      targetUserId: secondUserId,
    }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// S08 — Question and option service
// ──────────────────────────────────────────────

test("questions: add and return questions of each type", async () => {
  const { addQuestion, addOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Question types",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const textQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Short text",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  assert.equal(textQ.type, SurveyQuestionType.SHORT_TEXT);
  assert.equal(textQ.prompt, "Short text");
  assert.equal(textQ.sortOrder, 0);

  const longTextQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Long text",
    type: SurveyQuestionType.LONG_TEXT,
  });
  assert.equal(longTextQ.sortOrder, 1);

  const choiceQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Single choice",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  assert.equal(choiceQ.sortOrder, 2);

  const multiQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Multiple choice",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
    maxSelections: 3,
  });
  assert.equal(multiQ.maxSelections, 3);
  assert.equal(multiQ.sortOrder, 3);

  const ratingQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Rating",
    type: SurveyQuestionType.RATING,
    ratingMin: 0,
    ratingMax: 10,
    ratingMinLabel: "Bad",
    ratingMaxLabel: "Good",
  });
  assert.equal(ratingQ.ratingMin, 0);
  assert.equal(ratingQ.ratingMax, 10);
  assert.equal(ratingQ.ratingMinLabel, "Bad");
  assert.equal(ratingQ.ratingMaxLabel, "Good");
  assert.equal(ratingQ.sortOrder, 4);

  // Verify audit logs
  const logs = await db.auditLog.findMany({
    where: { entityId: survey.id, action: "SURVEY_QUESTION_ADDED" },
  });
  assert.equal(logs.length, 5);
});

test("questions: adding to a non-draft survey is rejected", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await db.survey.create({
    data: {
      title: "Published survey",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.PUBLISHED,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2026-02-01"),
    },
  });

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Should fail",
      type: SurveyQuestionType.SHORT_TEXT,
    }),
    SurveyServiceError,
  );
});

test("questions: empty prompt is rejected", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Empty prompt",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "   ",
      type: SurveyQuestionType.SHORT_TEXT,
    }),
    SurveyServiceError,
  );
});

test("questions: rating bounds are validated", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Rating bounds",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Bad rating",
      type: SurveyQuestionType.RATING,
      ratingMin: -1,
      ratingMax: 5,
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Bad rating",
      type: SurveyQuestionType.RATING,
      ratingMin: 1,
      ratingMax: 11,
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Bad rating",
      type: SurveyQuestionType.RATING,
      ratingMin: 5,
      ratingMax: 3,
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Bad rating",
      type: SurveyQuestionType.RATING,
      ratingMin: 1.5,
      ratingMax: 5,
    }),
    SurveyServiceError,
  );
});

test("questions: maxSelections is validated per type", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Max selections",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  // Valid for MULTIPLE_CHOICE
  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Multi",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
    maxSelections: 2,
  });
  assert.equal(q.maxSelections, 2);

  // Invalid for SINGLE_CHOICE
  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Single",
      type: SurveyQuestionType.SINGLE_CHOICE,
      maxSelections: 2,
    }),
    SurveyServiceError,
  );

  // Invalid for SHORT_TEXT
  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Text",
      type: SurveyQuestionType.SHORT_TEXT,
      maxSelections: 2,
    }),
    SurveyServiceError,
  );

  // Non-positive integer is rejected
  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Multi bad",
      type: SurveyQuestionType.MULTIPLE_CHOICE,
      maxSelections: 0,
    }),
    SurveyServiceError,
  );
});

test("questions: randomizeOptions is rejected for non-choice types", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Randomize",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Text",
      type: SurveyQuestionType.SHORT_TEXT,
      randomizeOptions: true,
    }),
    SurveyServiceError,
  );
});

test("questions: update question properties", async () => {
  const { addQuestion, updateQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Update question",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Original",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  const updated = await updateQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    prompt: "Updated",
    helpText: "Helpful text",
    required: true,
  });

  assert.equal(updated.prompt, "Updated");
  assert.equal(updated.helpText, "Helpful text");
  assert.equal(updated.required, true);
});

test("questions: update validates merged state", async () => {
  const { addQuestion, updateQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Update validates",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Rating",
    type: SurveyQuestionType.RATING,
    ratingMin: 1,
    ratingMax: 5,
  });

  // Setting ratingMin > ratingMax should fail
  await assert.rejects(
    updateQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      ratingMin: 5,
      ratingMax: 3,
    }),
    SurveyServiceError,
  );
});

test("questions: delete removes question and normalizes sort order", async () => {
  const { addQuestion, deleteQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Delete question",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const q2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q2",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const q3 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q3",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await deleteQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q2.id,
  });

  const remaining = await db.surveyQuestion.findMany({
    where: { surveyId: survey.id },
    orderBy: { sortOrder: "asc" },
  });

  assert.equal(remaining.length, 2);
  assert.equal(remaining[0].id, q1.id);
  assert.equal(remaining[0].sortOrder, 0);
  assert.equal(remaining[1].id, q3.id);
  assert.equal(remaining[1].sortOrder, 1);
});

test("questions: delete handles dependent conditions", async () => {
  const { addQuestion, addOption, deleteQuestion, deleteOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Delete with conditions",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const sourceQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const targetQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQ.id,
    label: "Yes",
  });

  await db.surveyQuestionCondition.create({
    data: {
      targetQuestionId: targetQ.id,
      sourceQuestionId: sourceQ.id,
      sourceOptionId: option.id,
      operator: SurveyConditionOperator.IS_SELECTED,
    },
  });

  // Deleting the source question should cascade and audit the condition
  await deleteQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQ.id,
  });

  const conditionLogs = await db.auditLog.findMany({
    where: {
      entityId: survey.id,
      action: "SURVEY_CONDITION_REMOVED",
    },
  });
  assert.equal(conditionLogs.length, 1);

  // Condition should be gone
  const conditions = await db.surveyQuestionCondition.findMany({
    where: { targetQuestionId: targetQ.id },
  });
  assert.equal(conditions.length, 0);
});

test("questions: cross-survey question ID is rejected", async () => {
  const { addQuestion, updateQuestion, deleteQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const s1 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Survey 1",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const s2 = await createSurveyDraft({
    actorUserId: adminId,
    title: "Survey 2",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: s1.id,
    prompt: "Q from S1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    updateQuestion({
      actorUserId: adminId,
      surveyId: s2.id,
      questionId: q.id,
      prompt: "Hacked",
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    deleteQuestion({
      actorUserId: adminId,
      surveyId: s2.id,
      questionId: q.id,
    }),
    SurveyServiceError,
  );
});

test("questions: reorder questions", async () => {
  const { addQuestion, reorderQuestions } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Reorder",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const q2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q2",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const q3 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q3",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await reorderQuestions({
    actorUserId: adminId,
    surveyId: survey.id,
    questionIds: [q3.id, q1.id, q2.id],
  });

  const questions = await db.surveyQuestion.findMany({
    where: { surveyId: survey.id },
    orderBy: { sortOrder: "asc" },
  });

  assert.equal(questions[0].id, q3.id);
  assert.equal(questions[0].sortOrder, 0);
  assert.equal(questions[1].id, q1.id);
  assert.equal(questions[1].sortOrder, 1);
  assert.equal(questions[2].id, q2.id);
  assert.equal(questions[2].sortOrder, 2);
});

test("questions: reorder rejects incomplete or cross-survey IDs", async () => {
  const { addQuestion, reorderQuestions } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Reorder validation",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const q2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q2",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  // Incomplete list
  await assert.rejects(
    reorderQuestions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionIds: [q1.id],
    }),
    SurveyServiceError,
  );

  // Cross-survey ID
  await assert.rejects(
    reorderQuestions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionIds: [q1.id, "fake-id"],
    }),
    SurveyServiceError,
  );

  // Duplicates
  await assert.rejects(
    reorderQuestions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionIds: [q1.id, q1.id],
    }),
    SurveyServiceError,
  );
});

test("questions: unauthorized user cannot edit", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Unauthorized",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addQuestion({
      actorUserId: userId,
      surveyId: survey.id,
      prompt: "Should fail",
      type: SurveyQuestionType.SHORT_TEXT,
    }),
    SurveyServiceError,
  );
});

test("questions: collaborator can add questions", async () => {
  const { addQuestion } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Collaborator edit",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await db.surveyCollaborator.create({
    data: { surveyId: survey.id, userId },
  });

  const q = await addQuestion({
    actorUserId: userId,
    surveyId: survey.id,
    prompt: "Collaborator question",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  assert.equal(q.prompt, "Collaborator question");
});

// ──────────────────────────────────────────────
// Option tests
// ──────────────────────────────────────────────

test("options: add and return options to choice questions", async () => {
  const { addQuestion, addOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Option add",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt1 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "Option A",
  });
  assert.equal(opt1.label, "Option A");
  assert.equal(opt1.sortOrder, 0);

  const opt2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "Option B",
  });
  assert.equal(opt2.sortOrder, 1);
});

test("options: cannot add to non-choice question", async () => {
  const { addQuestion, addOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Non-choice option",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Text",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    addOption({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      label: "Option",
    }),
    SurveyServiceError,
  );
});

test("options: duplicate label rejected", async () => {
  const { addQuestion, addOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Duplicate option",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "Option A",
  });

  await assert.rejects(
    addOption({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      label: "Option A",
    }),
    SurveyServiceError,
  );
});

test("options: update option label", async () => {
  const { addQuestion, addOption, updateOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Update option",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "Old label",
  });

  const updated = await updateOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    optionId: opt.id,
    label: "New label",
  });
  assert.equal(updated.label, "New label");
});

test("options: delete option normalizes sort order", async () => {
  const { addQuestion, addOption, deleteOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Delete option",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt1 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "A",
  });
  const opt2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "B",
  });
  const opt3 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "C",
  });

  await deleteOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    optionId: opt2.id,
  });

  const remaining = await db.surveyOption.findMany({
    where: { questionId: q.id },
    orderBy: { sortOrder: "asc" },
  });

  assert.equal(remaining.length, 2);
  assert.equal(remaining[0].id, opt1.id);
  assert.equal(remaining[0].sortOrder, 0);
  assert.equal(remaining[1].id, opt3.id);
  assert.equal(remaining[1].sortOrder, 1);
});

test("options: delete option with dependent condition audits it", async () => {
  const { addQuestion, addOption, deleteOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Delete option condition",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const sourceQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const targetQ = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const opt = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQ.id,
    label: "Yes",
  });

  await db.surveyQuestionCondition.create({
    data: {
      targetQuestionId: targetQ.id,
      sourceQuestionId: sourceQ.id,
      sourceOptionId: opt.id,
      operator: SurveyConditionOperator.IS_SELECTED,
    },
  });

  await deleteOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQ.id,
    optionId: opt.id,
  });

  const conditionLogs = await db.auditLog.findMany({
    where: {
      entityId: survey.id,
      action: "SURVEY_CONDITION_REMOVED",
    },
  });
  assert.equal(conditionLogs.length, 1);

  const conditions = await db.surveyQuestionCondition.findMany({
    where: { sourceOptionId: opt.id },
  });
  assert.equal(conditions.length, 0);
});

test("options: cross-survey option ID is rejected", async () => {
  const { addQuestion, addOption, updateOption, deleteOption } = await import(
    "@/lib/survey-service/questions"
  );

  const s1 = await createSurveyDraft({
    actorUserId: adminId,
    title: "S1",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const s2 = await createSurveyDraft({
    actorUserId: adminId,
    title: "S2",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q1 = await addQuestion({
    actorUserId: adminId,
    surveyId: s1.id,
    prompt: "Q1",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  await addQuestion({
    actorUserId: adminId,
    surveyId: s2.id,
    prompt: "Q2",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt = await addOption({
    actorUserId: adminId,
    surveyId: s1.id,
    questionId: q1.id,
    label: "Option",
  });

  // Wrong survey
  await assert.rejects(
    updateOption({
      actorUserId: adminId,
      surveyId: s2.id,
      questionId: q1.id,
      optionId: opt.id,
      label: "Hacked",
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    deleteOption({
      actorUserId: adminId,
      surveyId: s2.id,
      questionId: q1.id,
      optionId: opt.id,
    }),
    SurveyServiceError,
  );
});

test("options: reorder options", async () => {
  const { addQuestion, addOption, reorderOptions } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Reorder options",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt1 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "A",
  });
  const opt2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "B",
  });
  const opt3 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "C",
  });

  await reorderOptions({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    optionIds: [opt3.id, opt1.id, opt2.id],
  });

  const options = await db.surveyOption.findMany({
    where: { questionId: q.id },
    orderBy: { sortOrder: "asc" },
  });

  assert.equal(options[0].id, opt3.id);
  assert.equal(options[0].sortOrder, 0);
  assert.equal(options[1].id, opt1.id);
  assert.equal(options[1].sortOrder, 1);
  assert.equal(options[2].id, opt2.id);
  assert.equal(options[2].sortOrder, 2);
});

test("options: reorder rejects incomplete or invalid IDs", async () => {
  const { addQuestion, addOption, reorderOptions } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Reorder validation",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  const opt1 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "A",
  });
  const opt2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: q.id,
    label: "B",
  });

  await assert.rejects(
    reorderOptions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      optionIds: [opt1.id],
    }),
    SurveyServiceError,
  );

  await assert.rejects(
    reorderOptions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      optionIds: [opt1.id, "fake-id"],
    }),
    SurveyServiceError,
  );
});

test("options: empty label is rejected", async () => {
  const { addQuestion, addOption } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Empty label",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const q = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Pick one",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });

  await assert.rejects(
    addOption({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: q.id,
      label: "   ",
    }),
    SurveyServiceError,
  );
});

test("questions: changing a choice to a non-choice clears options and conditions", async () => {
  const { addOption, addQuestion, updateQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Question type cleanup",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const sourceQuestion = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
    randomizeOptions: true,
  });
  const targetQuestion = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const sourceOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQuestion.id,
    label: "Yes",
  });
  await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQuestion.id,
    label: "No",
  });
  await db.surveyQuestionCondition.create({
    data: {
      targetQuestionId: targetQuestion.id,
      sourceQuestionId: sourceQuestion.id,
      sourceOptionId: sourceOption.id,
      operator: SurveyConditionOperator.IS_SELECTED,
    },
  });

  const updated = await updateQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: sourceQuestion.id,
    type: SurveyQuestionType.LONG_TEXT,
  });

  assert.equal(updated.type, SurveyQuestionType.LONG_TEXT);
  assert.equal(updated.randomizeOptions, false);
  assert.equal(
    await db.surveyOption.count({
      where: { questionId: sourceQuestion.id },
    }),
    0,
  );
  assert.equal(
    await db.surveyQuestionCondition.count({
      where: { sourceQuestionId: sourceQuestion.id },
    }),
    0,
  );
  assert.equal(
    await db.auditLog.count({
      where: {
        entityId: survey.id,
        action: "SURVEY_CONDITION_REMOVED",
      },
    }),
    1,
  );
});

test("questions: rating configuration is normalized and cannot be retained by other types", async () => {
  const { addQuestion, updateQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Rating configuration",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await assert.rejects(
    addQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      prompt: "Invalid text configuration",
      type: SurveyQuestionType.SHORT_TEXT,
      ratingMin: 1,
    }),
    SurveyServiceError,
  );

  const rating = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Default rating",
    type: SurveyQuestionType.RATING,
  });
  assert.equal(rating.ratingMin, 1);
  assert.equal(rating.ratingMax, 5);

  await assert.rejects(
    updateQuestion({
      actorUserId: adminId,
      surveyId: survey.id,
      questionId: rating.id,
      ratingMin: null,
    }),
    SurveyServiceError,
  );

  const text = await updateQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: rating.id,
    type: SurveyQuestionType.SHORT_TEXT,
  });
  assert.equal(text.ratingMin, null);
  assert.equal(text.ratingMax, null);
  assert.equal(text.ratingMinLabel, null);
  assert.equal(text.ratingMaxLabel, null);
});

test("questions: publish validation enforces complete unique choice configuration", async () => {
  const {
    addOption,
    addQuestion,
    assertSurveyQuestionsReadyForPublish,
  } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Publish validation",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const choice = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Choice",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const firstOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: choice.id,
    label: "First",
  });

  await assert.rejects(
    assertSurveyQuestionsReadyForPublish(survey.id, db),
    SurveyServiceError,
  );

  const secondOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: choice.id,
    label: "Second",
  });
  await assert.doesNotReject(
    assertSurveyQuestionsReadyForPublish(survey.id, db),
  );

  await db.surveyOption.update({
    where: { id: secondOption.id },
    data: { label: firstOption.label },
  });
  await assert.rejects(
    assertSurveyQuestionsReadyForPublish(survey.id, db),
    SurveyServiceError,
  );
});

test("questions: publish validation rejects max selections above option count", async () => {
  const {
    addOption,
    addQuestion,
    assertSurveyQuestionsReadyForPublish,
  } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Maximum selections",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const question = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Choose",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
    maxSelections: 3,
  });
  await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: question.id,
    label: "First",
  });
  await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: question.id,
    label: "Second",
  });

  await assert.rejects(
    assertSurveyQuestionsReadyForPublish(survey.id, db),
    SurveyServiceError,
  );
});

test("questions: inserts repair non-contiguous question and option order", async () => {
  const { addOption, addQuestion } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Insert normalization",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const firstQuestion = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "First",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const secondQuestion = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Second",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  await db.surveyQuestion.update({
    where: { id: secondQuestion.id },
    data: { sortOrder: 5 },
  });

  const thirdQuestion = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Third",
    type: SurveyQuestionType.LONG_TEXT,
  });
  const questions = await db.surveyQuestion.findMany({
    where: { surveyId: survey.id },
    orderBy: { sortOrder: "asc" },
  });
  assert.deepEqual(
    questions.map((question) => [question.id, question.sortOrder]),
    [
      [firstQuestion.id, 0],
      [secondQuestion.id, 1],
      [thirdQuestion.id, 2],
    ],
  );

  const firstOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: firstQuestion.id,
    label: "First",
  });
  const secondOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: firstQuestion.id,
    label: "Second",
  });
  await db.surveyOption.update({
    where: { id: secondOption.id },
    data: { sortOrder: 5 },
  });

  const thirdOption = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: firstQuestion.id,
    label: "Third",
  });
  const options = await db.surveyOption.findMany({
    where: { questionId: firstQuestion.id },
    orderBy: { sortOrder: "asc" },
  });
  assert.deepEqual(
    options.map((option) => [option.id, option.sortOrder]),
    [
      [firstOption.id, 0],
      [secondOption.id, 1],
      [thirdOption.id, 2],
    ],
  );
});

// ──────────────────────────────────────────────
// Condition operations
// ──────────────────────────────────────────────

test("conditions: set a valid condition on a target question", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Condition test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source.id,
    label: "Yes",
  });

  await setQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
    sourceQuestionId: source.id,
    sourceOptionId: option.id,
    operator: "IS_SELECTED",
  });

  const condition = await db.surveyQuestionCondition.findUnique({
    where: { targetQuestionId: target.id },
  });
  assert.ok(condition);
  assert.equal(condition.sourceQuestionId, source.id);
  assert.equal(condition.sourceOptionId, option.id);
  assert.equal(condition.operator, "IS_SELECTED");
});

test("conditions: replacing an existing condition updates it", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Condition replace",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source 1",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const source2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source 2",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.LONG_TEXT,
  });
  const option1 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source1.id,
    label: "A",
  });
  const option2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source2.id,
    label: "B",
  });

  await setQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
    sourceQuestionId: source1.id,
    sourceOptionId: option1.id,
    operator: "IS_SELECTED",
  });

  await setQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
    sourceQuestionId: source2.id,
    sourceOptionId: option2.id,
    operator: "IS_NOT_SELECTED",
  });

  const conditions = await db.surveyQuestionCondition.findMany({
    where: { targetQuestionId: target.id },
  });
  assert.equal(conditions.length, 1);
  assert.equal(conditions[0].sourceQuestionId, source2.id);
  assert.equal(conditions[0].sourceOptionId, option2.id);
  assert.equal(conditions[0].operator, "IS_NOT_SELECTED");
});

test("conditions: remove a condition", async () => {
  const { addQuestion, addOption, setQuestionCondition, removeQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Remove condition",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source.id,
    label: "Yes",
  });

  await setQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
    sourceQuestionId: source.id,
    sourceOptionId: option.id,
    operator: "IS_SELECTED",
  });

  await removeQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
  });

  const condition = await db.surveyQuestionCondition.findUnique({
    where: { targetQuestionId: target.id },
  });
  assert.equal(condition, null);
});

test("conditions: self-reference is rejected", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Self-ref",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const question = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Self",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: question.id,
    label: "Yes",
  });

  await assert.rejects(
    setQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: question.id,
      sourceQuestionId: question.id,
      sourceOptionId: option.id,
      operator: "IS_SELECTED",
    }),
    SurveyServiceError,
  );
});

test("conditions: source after target is rejected", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Order",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target (first)",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source (second)",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source.id,
    label: "Yes",
  });

  await assert.rejects(
    setQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
      sourceQuestionId: source.id,
      sourceOptionId: option.id,
      operator: "IS_SELECTED",
    }),
    SurveyServiceError,
  );
});

test("conditions: reordering cannot move a target before its source", async () => {
  const {
    addOption,
    addQuestion,
    reorderQuestions,
    setQuestionCondition,
  } = await import("@/lib/survey-service/questions");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Condition reorder",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source.id,
    label: "Yes",
  });
  await setQuestionCondition({
    actorUserId: adminId,
    surveyId: survey.id,
    targetQuestionId: target.id,
    sourceQuestionId: source.id,
    sourceOptionId: option.id,
    operator: "IS_SELECTED",
  });

  const auditCountBefore = await db.auditLog.count({
    where: {
      entityId: survey.id,
      action: "SURVEY_QUESTIONS_REORDERED",
    },
  });

  await assert.rejects(
    reorderQuestions({
      actorUserId: adminId,
      surveyId: survey.id,
      questionIds: [target.id, source.id],
    }),
    SurveyServiceError,
  );

  const questions = await db.surveyQuestion.findMany({
    where: { surveyId: survey.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  assert.deepEqual(questions, [
    { id: source.id, sortOrder: 0 },
    { id: target.id, sortOrder: 1 },
  ]);
  assert.equal(
    await db.auditLog.count({
      where: {
        entityId: survey.id,
        action: "SURVEY_QUESTIONS_REORDERED",
      },
    }),
    auditCountBefore,
  );
});

test("conditions: cross-survey source question is rejected", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Cross-survey",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const otherSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Other survey",
    kind: SurveyKind.DATA_COLLECTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: otherSurvey.id,
    prompt: "Source",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: otherSurvey.id,
    questionId: source.id,
    label: "Yes",
  });

  await assert.rejects(
    setQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
      sourceQuestionId: source.id,
      sourceOptionId: option.id,
      operator: "IS_SELECTED",
    }),
    SurveyServiceError,
  );
});

test("conditions: non-choice source question is rejected", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Non-choice",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Text source",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.LONG_TEXT,
  });
  const dummyChoice = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Dummy choice",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const option = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: dummyChoice.id,
    label: "Dummy",
  });

  await assert.rejects(
    setQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
      sourceQuestionId: source.id,
      sourceOptionId: option.id,
      operator: "IS_SELECTED",
    }),
    SurveyServiceError,
  );
});

test("conditions: option not belonging to source question is rejected", async () => {
  const { addQuestion, addOption, setQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Wrong option",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const source1 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source 1",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const source2 = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Source 2",
    type: SurveyQuestionType.SINGLE_CHOICE,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });
  const optionFromSource2 = await addOption({
    actorUserId: adminId,
    surveyId: survey.id,
    questionId: source2.id,
    label: "Wrong",
  });

  await assert.rejects(
    setQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
      sourceQuestionId: source1.id,
      sourceOptionId: optionFromSource2.id,
      operator: "IS_SELECTED",
    }),
    SurveyServiceError,
  );
});

test("conditions: remove non-existent condition is rejected", async () => {
  const { addQuestion, removeQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "No condition",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    removeQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
    }),
    SurveyServiceError,
  );
});

test("conditions: cross-survey target question is rejected on remove", async () => {
  const { addQuestion, removeQuestionCondition } = await import(
    "@/lib/survey-service/questions"
  );

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Cross rm",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const otherSurvey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Other",
    kind: SurveyKind.DATA_COLLECTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  const target = await addQuestion({
    actorUserId: adminId,
    surveyId: otherSurvey.id,
    prompt: "Target",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    removeQuestionCondition({
      actorUserId: adminId,
      surveyId: survey.id,
      targetQuestionId: target.id,
    }),
    SurveyServiceError,
  );
});

// ──────────────────────────────────────────────
// Deterministic option ordering
// ──────────────────────────────────────────────

test("option order: disabled randomization preserves sort order", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const options = [
    { id: "c", sortOrder: 2 },
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
  ];
  const order = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-1",
    false,
  );
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("option order: same seed produces same order", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const options = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
    { id: "d", sortOrder: 3 },
    { id: "e", sortOrder: 4 },
  ];

  const order1 = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  const order2 = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  assert.deepEqual(order1, order2);
});

test("option order: same seed ignores caller input order", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const designerOrder = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
    { id: "d", sortOrder: 3 },
  ];
  const reversedInput = [...designerOrder].reverse();

  const order1 = getDeterministicOptionOrder(
    designerOrder,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  const order2 = getDeterministicOptionOrder(
    reversedInput,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  assert.deepEqual(order1, order2);
});

test("option order: different users receive different orders", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const options = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
    { id: "d", sortOrder: 3 },
    { id: "e", sortOrder: 4 },
  ];

  const order1 = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  const order2 = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-2",
    true,
  );
  assert.notDeepEqual(order1, order2);
});

test("option order: different surveys produce different orders", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const options = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
  ];

  const order1 = getDeterministicOptionOrder(
    options,
    "survey-a",
    "question-1",
    "user-1",
    true,
  );
  const order2 = getDeterministicOptionOrder(
    options,
    "survey-b",
    "question-1",
    "user-1",
    true,
  );
  assert.notDeepEqual(order1, order2);
});

test("option order: output contains all options exactly once", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const options = [
    { id: "x", sortOrder: 0 },
    { id: "y", sortOrder: 1 },
    { id: "z", sortOrder: 2 },
  ];
  const order = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  assert.equal(order.length, 3);
  assert.deepEqual(new Set(order), new Set(["x", "y", "z"]));
});

// ──────────────────────────────────────────────
// Lifecycle: publish
// ──────────────────────────────────────────────

test("publishSurvey: owner can publish a valid draft with ALL_ACTIVE audience", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Publish test",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    title: "Publish test",
    actorUserId: adminId,
    surveyId: survey.id,
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "How was your experience?",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  const updated = await db.survey.findUnique({
    where: { id: survey.id },
    select: {
      state: true,
      publishedAt: true,
      _count: { select: { recipients: true } },
    },
  });

  assert.equal(updated?.state, SurveyState.PUBLISHED);
  assert.ok(updated?.publishedAt !== null);
  assert.ok((updated?._count.recipients ?? 0) > 0);
});

test("publishSurvey: admin can publish a valid draft with TARGETED audience", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");
  const { setAudienceMode, addAudienceTeam, addAudienceUser } = await import(
    "@/lib/survey-service/audience"
  );

  const team = await db.team.create({ data: { name: "Publish Team" } });
  await db.teamMembership.create({
    data: { teamId: team.id, userId: secondUserId },
  });

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Targeted publish",
    kind: SurveyKind.DATA_COLLECTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Targeted publish",
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
  });

  await setAudienceMode({
    actorUserId: adminId,
    surveyId: survey.id,
    audienceMode: SurveyAudienceMode.TARGETED,
  });
  await addAudienceTeam({
    actorUserId: adminId,
    surveyId: survey.id,
    teamId: team.id,
  });
  await addAudienceUser({
    actorUserId: adminId,
    surveyId: survey.id,
    targetUserId: userId,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Rate us",
    type: SurveyQuestionType.RATING,
    ratingMin: 1,
    ratingMax: 5,
  });

  await publishSurvey({ actorUserId: adminId, surveyId: survey.id });

  await db.teamMembership.create({
    data: { teamId: team.id, userId: managerId },
  });

  const updated = await db.survey.findUnique({
    where: { id: survey.id },
    select: {
      state: true,
      publishedAt: true,
      recipients: {
        select: { userId: true },
        orderBy: { userId: "asc" },
      },
    },
  });
  assert.equal(updated?.state, SurveyState.PUBLISHED);
  assert.ok(updated?.publishedAt !== null);
  assert.deepEqual(
    updated?.recipients.map((recipient) => recipient.userId),
    [secondUserId, userId].sort(),
  );
});

test("publishSurvey: rejects non-owner without admin role", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "Not mine",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
    },
  });

  await assert.rejects(
    publishSurvey({ actorUserId: secondUserId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: rejects draft without start/end dates", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "No dates",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: rejects draft without questions", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "No questions",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "No questions",
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: rejects anonymous survey with fewer than 5 recipients", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Anon too few",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.ANONYMOUS,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Anon too few",
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: rejects already-published survey", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "Already published",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.PUBLISHED,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
      startsAt: new Date("2026-01-01T06:00:00Z"),
      endsAt: new Date("2026-01-01T14:00:00Z"),
    },
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: cross-survey ID is rejected", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "Other survey",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: secondUserId,
    },
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: end time must be after start time", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "Bad times",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
      startsAt: new Date("2026-09-01T14:00:00Z"),
      endsAt: new Date("2026-09-01T06:00:00Z"),
    },
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );
});

test("publishSurvey: revalidates stored metadata before publishing", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await db.survey.create({
    data: {
      title: "   ",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
      startsAt: new Date("2026-09-01T06:00:00Z"),
      endsAt: new Date("2026-09-01T14:00:00Z"),
      questions: {
        create: {
          prompt: "Q1",
          type: SurveyQuestionType.SHORT_TEXT,
        },
      },
    },
  });

  await assert.rejects(
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );

  const unchanged = await db.survey.findUnique({
    where: { id: survey.id },
    select: { state: true, recipients: true },
  });
  assert.equal(unchanged?.state, SurveyState.DRAFT);
  assert.equal(unchanged?.recipients.length, 0);
});

test("publishSurvey: rejects invalid stored branching conditions atomically", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const otherSurvey = await db.survey.create({
    data: {
      title: "Other condition source",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
    },
  });
  const sourceQuestion = await db.surveyQuestion.create({
    data: {
      surveyId: otherSurvey.id,
      prompt: "Other source",
      type: SurveyQuestionType.SINGLE_CHOICE,
      sortOrder: 0,
    },
  });
  const sourceOption = await db.surveyOption.create({
    data: {
      questionId: sourceQuestion.id,
      label: "Yes",
      sortOrder: 0,
    },
  });

  const survey = await db.survey.create({
    data: {
      title: "Invalid condition",
      kind: SurveyKind.SATISFACTION,
      state: SurveyState.DRAFT,
      identityMode: SurveyIdentityMode.NAMED,
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      ownerId: adminId,
      startsAt: new Date("2026-09-01T06:00:00Z"),
      endsAt: new Date("2026-09-01T14:00:00Z"),
    },
  });
  const targetQuestion = await db.surveyQuestion.create({
    data: {
      surveyId: survey.id,
      prompt: "Target",
      type: SurveyQuestionType.SHORT_TEXT,
      sortOrder: 1,
    },
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
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    SurveyServiceError,
  );

  const unchanged = await db.survey.findUnique({
    where: { id: survey.id },
    select: { state: true, recipients: true },
  });
  assert.equal(unchanged?.state, SurveyState.DRAFT);
  assert.equal(unchanged?.recipients.length, 0);
  assert.equal(
    await db.auditLog.count({
      where: {
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_PUBLISHED",
      },
    }),
    0,
  );
});

test("publishSurvey: concurrent double publish does not duplicate recipients", async () => {
  const { publishSurvey } = await import("@/lib/survey-service/lifecycle");

  const survey = await createSurveyDraft({
    actorUserId: adminId,
    title: "Concurrent",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });

  await updateSurveyMetadata({
    actorUserId: adminId,
    surveyId: survey.id,
    title: "Concurrent",
    startsAt: new Date("2026-09-01T06:00:00Z"),
    endsAt: new Date("2026-09-01T14:00:00Z"),
  });

  const { addQuestion } = await import("@/lib/survey-service/questions");
  await addQuestion({
    actorUserId: adminId,
    surveyId: survey.id,
    prompt: "Q1",
    type: SurveyQuestionType.SHORT_TEXT,
  });

  const results = await Promise.allSettled([
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
    publishSurvey({ actorUserId: adminId, surveyId: survey.id }),
  ]);

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );

  const recipients = await db.surveyRecipient.findMany({
    where: { surveyId: survey.id },
  });
  const userIds = recipients.map((r) => r.userId);
  assert.equal(userIds.length, new Set(userIds).size);
  assert.equal(
    await db.auditLog.count({
      where: {
        entityType: "Survey",
        entityId: survey.id,
        action: "SURVEY_PUBLISHED",
      },
    }),
    1,
  );
});

// ──────────────────────────────────────────────
// Lifecycle: extend end time
// ──────────────────────────────────────────────

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

test("survey metadata editor validation rejects empty title and invalid kind", async () => {
  const { createSurveySchema } = await import("@/lib/survey-validators");
  const { SurveyKind } = await import("@prisma/client");

  // Empty title
  const result1 = createSurveySchema.safeParse({
    title: "",
    description: "",
    kind: SurveyKind.SATISFACTION,
    identityMode: "NAMED",
  });
  assert.equal(result1.success, false);
  if (!result1.success) {
    assert.ok(result1.error.flatten().fieldErrors.title);
  }

  // Valid
  const result2 = createSurveySchema.safeParse({
    title: "Valid survey",
    description: "A description",
    kind: SurveyKind.SATISFACTION,
    identityMode: "NAMED",
  });
  assert.equal(result2.success, true);

  // Very long title
  const result3 = createSurveySchema.safeParse({
    title: "x".repeat(201),
    description: "",
    kind: SurveyKind.SATISFACTION,
    identityMode: "NAMED",
  });
  assert.equal(result3.success, false);
});

test("survey metadata editor validation rejects invalid kind and identity mode", async () => {
  const { createSurveySchema } = await import("@/lib/survey-validators");

  // Invalid kind
  const result1 = createSurveySchema.safeParse({
    title: "Test",
    description: "",
    kind: "INVALID_KIND",
    identityMode: "NAMED",
  });
  assert.equal(result1.success, false);

  // Invalid identity mode
  const result2 = createSurveySchema.safeParse({
    title: "Test",
    description: "",
    kind: "SATISFACTION",
    identityMode: "INVALID_MODE",
  });
  assert.equal(result2.success, false);
});

test("survey metadata editor update schema validates dates and times", async () => {
  const { updateMetadataSchema } = await import("@/lib/survey-validators");

  // Valid update with all fields
  const result1 = updateMetadataSchema.safeParse({
    surveyId: "test-id",
    title: "Updated survey",
    kind: "SATISFACTION",
    identityMode: "NAMED",
  });
  assert.equal(result1.success, true);

  // Invalid time format
  const result2 = updateMetadataSchema.safeParse({
    surveyId: "test-id",
    title: "Test",
    startTime: "09:30",
  });
  assert.equal(result2.success, false);

  // Valid time format
  const result3 = updateMetadataSchema.safeParse({
    surveyId: "test-id",
    title: "Test",
    startTime: "09:00",
  });
  assert.equal(result3.success, true);

  // Empty title
  const result4 = updateMetadataSchema.safeParse({
    surveyId: "test-id",
    title: "",
  });
  assert.equal(result4.success, false);

  // Title too long
  const result5 = updateMetadataSchema.safeParse({
    surveyId: "test-id",
    title: "x".repeat(201),
  });
  assert.equal(result5.success, false);
});

// S14 — Basic question builder validation schemas

test("survey question builder schemas validate prompt, type, and required", async () => {
  const { addQuestionSchema, updateQuestionSchema, deleteQuestionSchema } =
    await import("@/lib/survey-validators");

  // Valid add
  const add1 = addQuestionSchema.safeParse({
    surveyId: "survey-1",
    prompt: "How was your experience?",
    type: "SHORT_TEXT",
    required: false,
  });
  assert.equal(add1.success, true);

  // Empty prompt is rejected
  const add2 = addQuestionSchema.safeParse({
    surveyId: "survey-1",
    prompt: "   ",
    type: "SHORT_TEXT",
    required: true,
  });
  assert.equal(add2.success, false);
  if (!add2.success) {
    assert.ok(add2.error.flatten().fieldErrors.prompt);
  }

  // Invalid type is rejected
  const add3 = addQuestionSchema.safeParse({
    surveyId: "survey-1",
    prompt: "Question",
    type: "INVALID_TYPE",
    required: false,
  });
  assert.equal(add3.success, false);

  // Valid update with help text
  const update1 = updateQuestionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Updated prompt",
    helpText: "Some help",
    type: "MULTIPLE_CHOICE",
    required: true,
  });
  assert.equal(update1.success, true);

  // Missing question id is rejected
  const update2 = updateQuestionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "",
    prompt: "Updated prompt",
    type: "SHORT_TEXT",
    required: false,
  });
  assert.equal(update2.success, false);

  // Valid delete
  const delete1 = deleteQuestionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
  });
  assert.equal(delete1.success, true);

  // Missing survey id is rejected
  const delete2 = deleteQuestionSchema.safeParse({
    surveyId: "",
    questionId: "question-1",
  });
  assert.equal(delete2.success, false);
});

// S15 option and reorder schema tests

test("survey option schemas validate label, questionId, and surveyId", async () => {
  const {
    addOptionSchema,
    updateOptionSchema,
    deleteOptionSchema,
  } = await import("@/lib/survey-validators");

  // Valid add
  const add1 = addOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    label: "گزینه ۱",
  });
  assert.equal(add1.success, true);

  // Empty label is rejected
  const add2 = addOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    label: "   ",
  });
  assert.equal(add2.success, false);

  // Missing questionId is rejected
  const add3 = addOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "",
    label: "Option",
  });
  assert.equal(add3.success, false);

  // Valid update
  const update1 = updateOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    optionId: "option-1",
    label: "Updated",
  });
  assert.equal(update1.success, true);

  // Missing optionId is rejected
  const update2 = updateOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    optionId: "",
    label: "Option",
  });
  assert.equal(update2.success, false);

  // Valid delete
  const delete1 = deleteOptionSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    optionId: "option-1",
  });
  assert.equal(delete1.success, true);
});

test("survey reorder schemas validate arrays", async () => {
  const { reorderOptionsSchema, reorderQuestionsSchema } = await import(
    "@/lib/survey-validators"
  );

  // Valid option reorder
  const opts1 = reorderOptionsSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    optionIds: ["opt-1", "opt-2", "opt-3"],
  });
  assert.equal(opts1.success, true);

  // Empty optionIds array is rejected
  const opts2 = reorderOptionsSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    optionIds: [],
  });
  assert.equal(opts2.success, false);

  // Valid question reorder
  const qs1 = reorderQuestionsSchema.safeParse({
    surveyId: "survey-1",
    questionIds: ["q-1", "q-2"],
  });
  assert.equal(qs1.success, true);

  // Empty questionIds array is rejected
  const qs2 = reorderQuestionsSchema.safeParse({
    surveyId: "survey-1",
    questionIds: [],
  });
  assert.equal(qs2.success, false);
});

test("survey update question with config schema validates rating and maxSelections", async () => {
  const { updateQuestionWithConfigSchema } = await import(
    "@/lib/survey-validators"
  );

  // Valid update with rating config
  const u1 = updateQuestionWithConfigSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Rate us",
    type: "RATING",
    required: true,
    ratingMin: 0,
    ratingMax: 10,
    ratingMinLabel: "Bad",
    ratingMaxLabel: "Good",
    maxSelections: null,
  });
  assert.equal(u1.success, true);

  // Valid update with maxSelections
  const u2 = updateQuestionWithConfigSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Pick some",
    type: "MULTIPLE_CHOICE",
    required: false,
    maxSelections: 3,
  });
  assert.equal(u2.success, true);

  // Rating min >= max is rejected by service, not schema (schema allows 0-10 range)
  const u3 = updateQuestionWithConfigSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Rate us",
    type: "RATING",
    required: true,
    ratingMin: 5,
    ratingMax: 5,
  });
  assert.equal(u3.success, true);

  // Rating out of range is rejected
  const u4 = updateQuestionWithConfigSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Rate us",
    type: "RATING",
    required: true,
    ratingMin: -1,
    ratingMax: 5,
  });
  assert.equal(u4.success, false);

  // maxSelections 0 is rejected
  const u5 = updateQuestionWithConfigSchema.safeParse({
    surveyId: "survey-1",
    questionId: "question-1",
    prompt: "Pick some",
    type: "MULTIPLE_CHOICE",
    required: false,
    maxSelections: 0,
  });
  assert.equal(u5.success, false);
});
