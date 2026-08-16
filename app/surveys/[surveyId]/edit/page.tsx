import { notFound, redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth";
import {
  canEditSurveyDraft,
  isSurveyManager,
  type SurveyActorUser,
} from "@/lib/survey-permissions";
import { resolveSurveyActor } from "@/lib/survey-service/shared";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { SurveyMetadataForm } from "@/components/surveys/survey-metadata-form";
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

  if (!canEditSurveyDraft(actor, survey.state)) {
    redirect("/surveys");
  }

  const canChangeKindIdentity = isSurveyManager(actor);

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
    </div>
  );
}
