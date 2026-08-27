import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Eye } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { SurveyMetadataForm } from "@/components/surveys/survey-metadata-form";
import { SurveyCollaboratorEditor } from "@/components/surveys/survey-collaborator-editor";
import { SurveyAudienceEditor } from "@/components/surveys/survey-audience-editor";
import { SurveyQuestionBuilder } from "@/components/surveys/survey-question-builder";
import { SurveyReadinessSummary } from "@/components/surveys/survey-readiness-summary";
import { SurveyLifecycleControls } from "@/components/surveys/survey-lifecycle-controls";
import { updateSurveyMetadataAction } from "@/app/surveys/actions";

type EditSurveyPageProps = {
  params: Promise<{ surveyId: string }>;
};

export default async function EditSurveyPage({ params }: EditSurveyPageProps) {
  const parsedParams = z.object({ surveyId: z.string().min(1).max(128) }).safeParse(await params);
  if (!parsedParams.success) {
    notFound();
  }
  const { surveyId } = parsedParams.data;
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
      lastReminderAt: true,
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
    <div className="mx-auto max-w-7xl space-y-6" dir="rtl">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold sm:text-2xl">{isDraft ? `ویرایش ${survey.title}` : survey.title}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${displayState === "DRAFT" ? "bg-amber-50 text-amber-800" : displayState === "ACTIVE" ? "bg-green-50 text-green-800" : displayState === "SCHEDULED" ? "bg-blue-50 text-blue-800" : "bg-muted text-muted-foreground"}`}>{displayState === "DRAFT" ? "پیش‌نویس" : displayState === "ACTIVE" ? "فعال" : displayState === "SCHEDULED" ? "زمان‌بندی‌شده" : "پایان‌یافته"}</span>
          </div>
          <p className="text-sm text-muted-foreground">{isDraft ? "سوال‌ها را بسازید و تنظیمات انتشار را در ستون کناری تکمیل کنید." : "نظرسنجی منتشر شده - اطلاعات قابل ویرایش نیست"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" type="button" variant="outline">
            <Link href={`/surveys/${survey.id}/preview`}>
              <Eye className="h-4 w-4" />
              پیش‌نمایش
            </Link>
          </Button>
          {isDraft ? <Button form="survey-metadata-form" size="sm" type="submit">ذخیره تغییرات</Button> : null}
        </div>
      </header>

      {/* Immutable-after-publish warning */}
      {!isDraft ? (
        <div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            این نظرسنجی قبلاً منتشر شده است. سوالات، گزینه‌ها، شرط‌ها، نوع،
            حالت هویت و مخاطبان قابل ویرایش نیستند.
          </div>
        </div>
      ) : null}

      {isDraft ? (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)]">
          <main className="min-w-0 space-y-8">
          <div className="border-b pb-8">
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
              formId="survey-metadata-form"
              hideSubmit={true}
              isEditing={true}
            />
          </div>

          <SurveyQuestionBuilder
            surveyId={survey.id}
            canEdit={canEdit}
            questions={questionBuilderQuestions!}
          />
          </main>

          <aside className="grid gap-6 [&>div]:rounded-none [&>div]:border-x-0 [&>div]:p-0 [&>fieldset]:rounded-none [&>fieldset]:border-x-0 [&>fieldset]:p-0 lg:sticky lg:top-24">
            <section className="grid gap-2 border-b pb-5">
              <h2 className="text-sm font-semibold">تنظیمات و انتشار</h2>
              <p className="text-xs leading-5 text-muted-foreground">زمان‌بندی، دسترسی و وضعیت انتشار را از اینجا مدیریت کنید.</p>
            </section>
            <SurveyCollaboratorEditor
              surveyId={survey.id}
              canManage={canManage}
              collaborators={collaborators!.map((c) => c.user)}
            />
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
            {readinessReport ? <SurveyReadinessSummary report={readinessReport} surveyTitle={survey.title} hasSchedule={survey.startsAt !== null && survey.endsAt !== null} /> : null}
            <SurveyLifecycleControls
              surveyId={survey.id} displayState={displayState}
              isOwnerOrAdmin={isOwnerOrAdmin} isAdmin={user.role === "ADMIN" && user.active}
              endsAt={survey.endsAt} lastReminderAt={survey.lastReminderAt} kind={survey.kind}
              isAnonymous={survey.identityMode === "ANONYMOUS"} ready={readinessReport?.ready ?? false}
              hasAnonymousThreshold={readinessReport?.hasAnonymousThreshold ?? false}
            />
          </aside>
        </div>
      ) : null}

      {/* Readiness summary (drafts only) */}
      {!isDraft && readinessReport ? (
        <div className="mx-auto max-w-2xl">
          <SurveyReadinessSummary
            report={readinessReport}
            surveyTitle={survey.title}
            hasSchedule={survey.startsAt !== null && survey.endsAt !== null}
          />
        </div>
      ) : null}

      {/* Lifecycle controls */}
      {!isDraft ? <div className="mx-auto max-w-2xl">
        <SurveyLifecycleControls
          surveyId={survey.id}
          displayState={displayState}
          isOwnerOrAdmin={isOwnerOrAdmin}
          isAdmin={user.role === "ADMIN" && user.active}
          endsAt={survey.endsAt}
          lastReminderAt={survey.lastReminderAt}
          kind={survey.kind}
          isAnonymous={survey.identityMode === "ANONYMOUS"}
          ready={readinessReport?.ready ?? false}
          hasAnonymousThreshold={readinessReport?.hasAnonymousThreshold ?? false}
        />
      </div> : null}

      {/* Preview (always visible for drafts, optionally for published) */}
    </div>
  );
}
