import { notFound, redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth";
import {
  canEditSurveyDraft,
  isSurveyManager,
  type SurveyActorUser,
} from "@/lib/survey-permissions";
import { resolveSurveyActor } from "@/lib/survey-service/shared";
import { previewAudience } from "@/lib/survey-service/audience";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { SurveyMetadataForm } from "@/components/surveys/survey-metadata-form";
import { SurveyCollaboratorEditor } from "@/components/surveys/survey-collaborator-editor";
import { SurveyAudienceEditor } from "@/components/surveys/survey-audience-editor";
import { SurveyQuestionBuilder } from "@/components/surveys/survey-question-builder";
import { updateSurveyMetadataAction } from "@/app/surveys/actions";

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

  if (!canEdit) {
    redirect("/surveys");
  }

  const canChangeKindIdentity = isSurveyManager(actor);
  const canManage = isSurveyManager(actor);

  const [collaborators, audienceUsers, preview, teams, questions] =
    await Promise.all([
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
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
    ]);

  return (
    <div className="space-y-8" dir="rtl">
      <PageHeader
        title={`ویرایش ${survey.title}`}
        subtitle="مشخصات و زمان‌بندی نظرسنجی"
      />

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
          collaborators={collaborators.map((c) => c.user)}
        />
      </div>

      <div className="mx-auto max-w-2xl">
        <SurveyAudienceEditor
          surveyId={survey.id}
          canManage={canManage}
          isDraft={survey.state === "DRAFT"}
          initial={{
            identityMode: survey.identityMode,
            collaborators: collaborators.map((c) => ({
              id: c.user.id,
              name: c.user.name,
              email: c.user.email,
            })),
            currentCollaboratorIds: collaborators.map((c) => c.user.id),
            audienceMode: survey.audienceMode,
            currentTeamIds: survey.audienceTeams.map((t) => t.teamId),
            currentUserIdSelections: survey.audienceUsers.map((u) => u.userId),
            state: survey.state,
            previewCount: preview.totalUniqueUsers,
            audienceUserDetails: audienceUsers.map((a) => a.user),
          }}
          teams={teams}
          identityMode={survey.identityMode}
        />
      </div>

      <div className="mx-auto max-w-2xl">
        <SurveyQuestionBuilder
          surveyId={survey.id}
          canEdit={canEdit}
          questions={questions}
        />
      </div>
    </div>
  );
}
