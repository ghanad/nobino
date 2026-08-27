import assert from "node:assert/strict";
import test from "node:test";

import { SurveyState, UserRole } from "@prisma/client";

import { registerBusinessRuleTestHooks } from "./business-rules-helpers";
import {
  canCreateSurvey,
  canEditSurveyDraft,
  canManageSurveyAccess,
  canPerformLifecycleAction,
  canSendSurveyReminder,
  canViewSurveyResults,
  isSurveyManager,
} from "@/lib/survey-permissions";
import type { SurveyActor } from "@/lib/survey-permissions";
import { getSurveyDisplayState } from "@/lib/survey-status";

registerBusinessRuleTestHooks();

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
