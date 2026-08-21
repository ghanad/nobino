import assert from "node:assert/strict";
import test from "node:test";

import {
  SurveyAudienceMode,
  SurveyIdentityMode,
  SurveyKind,
  SurveyState,
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
  deleteSurvey,
  listAuthoringSurveys,
  listRespondentSurveys,
  SURVEY_DESCRIPTION_MAX_LENGTH,
  SURVEY_TITLE_MAX_LENGTH,
  updateSurveyMetadata,
} from "@/lib/survey-service/metadata";
import { SurveyServiceError } from "@/lib/survey-service/shared";

registerBusinessRuleTestHooks();

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
    deleteSurvey({ actorUserId: adminId, surveyId: "missing-survey" }),
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
    deleteSurvey({ actorUserId: adminId, surveyId: survey.id }),
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

test("drafts can be deleted by their owner or an admin, other states only by an admin", async () => {
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
    deleteSurvey({ actorUserId: secondUserId, surveyId: survey.id }),
    SurveyServiceError,
  );
  await assert.rejects(
    deleteSurvey({ actorUserId: userId, surveyId: survey.id }),
    SurveyServiceError,
  );

  await db.survey.update({
    where: { id: survey.id },
    data: { state: SurveyState.PUBLISHED },
  });

  await db.user.update({
    where: { id: secondUserId },
    data: { canCreateSurveys: true },
  });
  const ownedPublished = await createSurveyDraft({
    actorUserId: secondUserId,
    title: "Owner published",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await db.survey.update({
    where: { id: ownedPublished.id },
    data: { state: SurveyState.PUBLISHED },
  });

  await assert.rejects(
    deleteSurvey({ actorUserId: secondUserId, surveyId: ownedPublished.id }),
    SurveyServiceError,
  );
  assert.ok(
    await db.survey.findUnique({ where: { id: ownedPublished.id } }),
  );

  await deleteSurvey({ actorUserId: adminId, surveyId: survey.id });
  assert.equal(await db.survey.findUnique({ where: { id: survey.id } }), null);

  const draft = await createSurveyDraft({
    actorUserId: adminId,
    title: "Deletable",
    kind: SurveyKind.SATISFACTION,
    identityMode: SurveyIdentityMode.NAMED,
  });
  await deleteSurvey({ actorUserId: adminId, surveyId: draft.id });
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

  await deleteSurvey({ actorUserId: adminId, surveyId: survey.id });

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

