import { notFound, redirect } from "next/navigation";

import type {
  SurveyConditionOperator,
  SurveyQuestionType,
} from "@prisma/client";

import { requireCurrentUser } from "@/lib/auth";
import {
  canEditSurveyDraft,
  isSurveyManager,
  type SurveyActorUser,
} from "@/lib/survey-permissions";
import { resolveSurveyActor } from "@/lib/survey-service/shared";
import { previewAudience } from "@/lib/survey-service/audience";
import { checkPublishReadiness } from "@/lib/survey-service/publish-readiness";
import { getSurveyDisplayState } from "@/lib/survey-status";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { SurveyMetadataForm } from "@/components/surveys/survey-metadata-form";
import { SurveyCollaboratorEditor } from "@/components/surveys/survey-collaborator-editor";
import { SurveyAudienceEditor } from "@/components/surveys/survey-audience-editor";
import { SurveyQuestionBuilder } from "@/components/surveys/survey-question-builder";
import { SurveyPreview } from "@/components/surveys/survey-preview";
import { SurveyReadinessSummary } from "@/components/surveys/survey-readiness-summary";
import { SurveyLifecycleControls } from "@/components/surveys/survey-lifecycle-controls";
import { updateSurveyMetadataAction } from "@/app/surveys/actions";
import type { QuestionConditionData } from "@/app/surveys/survey-branching-actions";

type EditSurveyPageProps = {
  params: Promise<{ surveyId: string }>;
};

export default async function EditSurveyPage({ params }: EditSurveyPageProps) {
  const { surveyId } = await params;
  const user = await requireCurrentUser();

  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      title: true,
      description: true,
      kind: true,
      state: true,
      identityMode: true,
      startsAt: true,
      endsAt: true,
      ownerId: true,
      audienceMode: true,
      audienceTeams: {
        select: { teamId: true },
      },
      audienceUsers: {
        select: { userId: true },
      },
    },
  });

  if (!survey) {
    notFound();
  }

  const actorUser: SurveyActorUser = {
    role: user.role,
    active: user.active,
    canCreateSurveys: user.canCreateSurveys,
  };

  const actor = await resolveSurveyActor(db, {
    actorUserId: user.id,
    surveyId: survey.id,
    ownerId: survey.ownerId,
    user: actorUser,
  });

  const canEdit = canEditSurveyDraft(actor, survey.state);
  const isOwnerOrAdmin = isSurveyManager(actor);

  if (!canEdit && !isOwnerOrAdmin) {
    redirect("/surveys");
  }

  const canChangeKindIdentity = isSurveyManager(actor);
  const canManage = isSurveyManager(actor);

  const displayState = getSurveyDisplayState(
    {
      state: survey.state,
      startsAt: survey.startsAt,
      endsAt: survey.endsAt,
    },
    new Date(),
  );

  const isDraft = survey.state === "DRAFT";

  // Always load preview data
  const questions = await db.surveyQuestion.findMany({
    where: { surveyId },
    select: {
      id: true,
      prompt: true,
      helpText: true,
      type: true,
      required: true,
      sortOrder: true,
      randomizeOptions: true,
      ratingMin: true,
      ratingMax: true,
      ratingMinLabel: true,
      ratingMaxLabel: true,
      maxSelections: true,
      options: {
        select: {
          id: true,
          label: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
      targetCondition: {
        select: {
          id: true,
          sourceQuestionId: true,
          sourceQuestion: {
            select: { prompt: true, type: true },
          },
          sourceOption: {
            select: { id: true, label: true },
          },
          operator: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  }).then((rawQuestions) =>
    rawQuestions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      helpText: q.helpText,
      type: q.type,
      required: q.required,
      sortOrder: q.sortOrder,
      randomizeOptions: q.randomizeOptions,
      ratingMin: q.ratingMin,
      ratingMax: q.ratingMax,
      ratingMinLabel: q.ratingMinLabel,
      ratingMaxLabel: q.ratingMaxLabel,
      maxSelections: q.maxSelections,
      options: q.options,
      condition: q.targetCondition
        ? {
            sourceQuestionPrompt: q.targetCondition.sourceQuestion.prompt,
            sourceOptionLabel: q.targetCondition.sourceOption.label,
            operator: q.targetCondition.operator,
          }
        : null,
    })),
  );

  // Load readiness report for drafts
  const readinessReport = isDraft
    ? await checkPublishReadiness(surveyId)
    : null;

  // Load full question data for the question builder (only for drafts)
  const [collaborators, audienceUsers, preview, teams, questionBuilderQuestions] =
    isDraft
      ? await Promise.all([
          db.surveyCollaborator.findMany({
            where: { surveyId },
            select: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          }),
          db.surveyAudienceUser.findMany({
            where: { surveyId },
            select: {
              userId: true,
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          }),
          previewAudience({ actorUserId: user.id, surveyId }),
          db.team.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          db.surveyQuestion.findMany({
            where: { surveyId },
            select: {
              id: true,
              prompt: true,
              helpText: true,
              type: true,
              required: true,
              sortOrder: true,
              randomizeOptions: true,
              ratingMin: true,
              ratingMax: true,
              ratingMinLabel: true,
              ratingMaxLabel: true,
              maxSelections: true,
              options: {
                select: {
                  id: true,
                  label: true,
                  sortOrder: true,
                },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              },
              targetCondition: {
                select: {
                  id: true,
                  sourceQuestionId: true,
                  sourceQuestion: {
                    select: { prompt: true, type: true },
                  },
                  sourceOption: {
                    select: { id: true, label: true },
                  },
                  operator: true,
                },
              },
            },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          }).then((rawQuestions) =>
            rawQuestions.map((q) => ({
              ...q,
              targetCondition: q.targetCondition
                ? {
                    id: q.targetCondition.id,
                    sourceQuestionId: q.targetCondition.sourceQuestionId,
                    sourceQuestionPrompt:
                      q.targetCondition.sourceQuestion.prompt,
                    sourceQuestionType: q.targetCondition.sourceQuestion.type,
                    sourceOptionId: q.targetCondition.sourceOption.id,
                    sourceOptionLabel: q.targetCondition.sourceOption.label,
                    operator: q.targetCondition.operator,
                  }
                : null,
            })),
          ),
        ])
      : [null, null, null, null, null];

  return (
    <div className="space-y-8" dir="rtl">
      <PageHeader
        title={isDraft ? `ویرایش ${survey.title}` : survey.title}
        subtitle={
          isDraft
            ? "مشخصات و زمان‌بندی نظرسنجی"
            : "نظرسنجی منتشر شده - اطلاعات قابل ویرایش نیست"
        }
      />

      {/* Immutable-after-publish warning */}
      {!isDraft ? (
        <div className="mx-auto max-w-2xl">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            این نظرسنجی قبلاً منتشر شده است. سوالات، گزینه‌ها، شرط‌ها، نوع،
            حالت هویت و مخاطبان قابل ویرایش نیستند.
          </div>
        </div>
      ) : null}

      {isDraft ? (
        <>
          {/* Draft editor sections */}
          <div className="mx-auto max-w-2xl">
            <SurveyMetadataForm
              action={updateSurveyMetadataAction}
              initial={{
                surveyId: survey.id,
                title: survey.title,
                description: survey.description,
                kind: survey.kind,
                identityMode: survey.identityMode,
                startsAt: survey.startsAt,
                endsAt: survey.endsAt,
              }}
              canChangeKindIdentity={canChangeKindIdentity}
              isEditing={true}
            />
          </div>

          <div className="mx-auto max-w-2xl">
            <SurveyCollaboratorEditor
              surveyId={survey.id}
              canManage={canManage}
              collaborators={collaborators!.map((c) => c.user)}
            />
          </div>

          <div className="mx-auto max-w-2xl">
            <SurveyAudienceEditor
              surveyId={survey.id}
              canManage={canManage}
              isDraft={true}
              initial={{
                identityMode: survey.identityMode,
                collaborators: collaborators!.map((c) => ({
                  id: c.user.id,
                  name: c.user.name,
                  email: c.user.email,
                })),
                currentCollaboratorIds: collaborators!.map((c) => c.user.id),
                audienceMode: survey.audienceMode,
                currentTeamIds: survey.audienceTeams.map((t) => t.teamId),
                currentUserIdSelections: survey.audienceUsers.map((u) => u.userId),
                state: survey.state,
                previewCount: preview!.totalUniqueUsers,
                audienceUserDetails: audienceUsers!.map((a) => a.user),
              }}
              teams={teams!}
              identityMode={survey.identityMode}
            />
          </div>

          <div className="mx-auto max-w-2xl">
            <SurveyQuestionBuilder
              surveyId={survey.id}
              canEdit={canEdit}
              questions={questionBuilderQuestions!}
            />
          </div>
        </>
      ) : null}

      {/* Readiness summary (drafts only) */}
      {isDraft && readinessReport ? (
        <div className="mx-auto max-w-2xl">
          <SurveyReadinessSummary
            report={readinessReport}
            surveyTitle={survey.title}
            hasSchedule={survey.startsAt !== null && survey.endsAt !== null}
          />
        </div>
      ) : null}

      {/* Lifecycle controls */}
      <div className="mx-auto max-w-2xl">
        <SurveyLifecycleControls
          surveyId={survey.id}
          surveyTitle={survey.title}
          displayState={displayState}
          isOwnerOrAdmin={isOwnerOrAdmin}
          endsAt={survey.endsAt}
          kind={survey.kind}
          isAnonymous={survey.identityMode === "ANONYMOUS"}
          ready={readinessReport?.ready ?? false}
          hasAnonymousThreshold={readinessReport?.hasAnonymousThreshold ?? false}
        />
      </div>

      {/* Preview (always visible for drafts, optionally for published) */}
      {isDraft || displayState === "ACTIVE" || displayState === "SCHEDULED" ? (
        <div className="mx-auto max-w-2xl">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">پیش‌نمایش نظرسنجی</h2>
            <SurveyPreview
              title={survey.title}
              description={survey.description}
              questions={questions}
              identityMode={survey.identityMode}
              isAnonymous={survey.identityMode === "ANONYMOUS"}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
