import { notFound } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth";
import { getSurveyForRecipient, type RecipientSurveyData } from "@/lib/survey-service/recipient";
import { isSurveyManager } from "@/lib/survey-permissions";
import { resolveSurveyActor } from "@/lib/survey-service/shared";
import { getSurveyDisplayStateLabel, getSurveyKindLabel, getSurveyIdentityLabel } from "@/lib/survey-status";
import { formatJalaliDateTime } from "@/lib/jalali-date";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { SurveyDetailDisplay } from "@/components/surveys/survey-detail-display";
import { SurveyServiceError } from "@/lib/survey-service/shared";

type SurveyDetailPageProps = {
  params: Promise<{ surveyId: string }>;
};

export default async function SurveyDetailPage({ params }: SurveyDetailPageProps) {
  const { surveyId } = await params;
  const user = await requireCurrentUser();

  let data: RecipientSurveyData;
  try {
    data = await getSurveyForRecipient(surveyId, user.id);
  } catch (error) {
    if (error instanceof SurveyServiceError) {
      notFound();
    }
    throw error;
  }

  const surveyCore = await db.survey.findUnique({
    where: { id: surveyId },
    select: { ownerId: true },
  });

  const actorUser = { role: user.role, active: user.active, canCreateSurveys: user.canCreateSurveys };
  const actor = await resolveSurveyActor(db, {
    actorUserId: user.id,
    surveyId,
    ownerId: surveyCore?.ownerId ?? "",
    user: actorUser,
  });

  const showParticipationCount = isSurveyManager(actor);
  const showManagementLink = isSurveyManager(actor);

  // Determine the state message for the page
  const stateMessage = getStateMessage(data.displayState, data.hasSubmitted);

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title={data.title}
        subtitle={data.description ?? ""}
        actions={
          showManagementLink ? (
            <a
              href={`/surveys/${data.id}/edit`}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              مدیریت نظرسنجی
            </a>
          ) : undefined
        }
      />

      {/* Survey metadata row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{getSurveyKindLabel(data.kind)}</span>
        <span>{getSurveyIdentityLabel(data.identityMode)}</span>
        <span>{getSurveyDisplayStateLabel(data.displayState)}</span>
        {data.startsAt ? (
          <span>شروع: {formatJalaliDateTime(data.startsAt)}</span>
        ) : null}
        {data.endsAt ? (
          <span>پایان: {formatJalaliDateTime(data.endsAt)}</span>
        ) : null}
        {showParticipationCount && data.participationCount !== null ? (
          <span>تعداد پاسخ‌ها: {data.participationCount}</span>
        ) : null}
      </div>

      {/* State-specific banner */}
      {stateMessage ? (
        <div className="rounded-md border px-4 py-3 text-sm" dir="rtl">
          {stateMessage}
        </div>
      ) : null}

      {/* Anonymous free-text warning */}
      {data.identityMode === "ANONYMOUS" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          پاسخ‌ها به صورت ناشناس ثبت می‌شوند. پاسخ شما قابل ردیابی نیست.
          متن پاسخ‌های آزاد ممکن است هویت شما را فاش کنند.
        </div>
      ) : null}

      {/* Questions display */}
      {data.questions.length > 0 ? (
        <SurveyDetailDisplay
          questions={data.questions}
          hasSubmitted={data.hasSubmitted}
          displayState={data.displayState}
          identityMode={data.identityMode}
        />
      ) : null}
    </div>
  );
}

function getStateMessage(
  displayState: string,
  hasSubmitted: boolean,
): string | null {
  if (hasSubmitted) {
    return "شما قبلاً به این نظرسنجی پاسخ داده‌اید. از مشارکت شما سپاسگزاریم.";
  }

  switch (displayState) {
    case "SCHEDULED":
      return "این نظرسنجی هنوز شروع نشده است. پس از شروع می‌توانید پاسخ دهید.";
    case "ENDED":
      return "این نظرسنجی به پایان رسیده است. پاسخ‌ها ثبت نمی‌شوند.";
    case "ARCHIVED":
      return "این نظرسنجی بایگانی شده است.";
    case "DRAFT":
      return "این نظرسنجی هنوز منتشر نشده است.";
    default:
      return null;
  }
}
