import { notFound } from "next/navigation";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth";
import { isSurveyManager } from "@/lib/survey-permissions";
import { getSurveyForRecipient, type RecipientSurveyData } from "@/lib/survey-service/recipient";
import { getSurveyDisplayStateLabel } from "@/lib/survey-status";
import { formatJalaliDateTime } from "@/lib/jalali-date";
import { SurveyDetailDisplay } from "@/components/surveys/survey-detail-display";
import { SurveyResponseForm } from "@/components/surveys/survey-response-form";
import { SurveyServiceError } from "@/lib/survey-service/shared";
import Link from "next/link";

type Props = {
  params: Promise<{ surveyId: string }>;
};

export default async function SurveyDetailPage({ params }: Props) {
  const parsedParams = z.object({ surveyId: z.string().min(1).max(128) }).safeParse(await params);
  if (!parsedParams.success) {
    notFound();
  }
  const { surveyId } = parsedParams.data;
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

  // Re-construct actor from user data for permission checks
  const actorUser = { role: user.role, active: user.active, canCreateSurveys: user.canCreateSurveys };
  const actor = {
    user: actorUser,
    isOwner: data.ownerId === user.id,
    isCollaborator: data.isCollaborator,
    isRecipient: data.isRecipient,
  };

  const showParticipationCount = isSurveyManager(actor);
  const showManagementLink = isSurveyManager(actor);

  // Determine the state message for the page
  const stateMessage = getStateMessage(data.displayState, data.hasSubmitted);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4" dir="rtl">
      <header className="flex flex-col gap-3 text-right sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold leading-8 text-slate-950">{data.title}</h1>
          {data.description ? (
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{data.description}</p>
          ) : null}
        </div>
        {showManagementLink ? (
          <div className="flex flex-wrap gap-2">
              <Link
                href={`/surveys/${data.id}/results`}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                نتایج
              </Link>
              <Link
                href={`/surveys/${data.id}/edit`}
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                مدیریت نظرسنجی
              </Link>
          </div>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{getSurveyDisplayStateLabel(data.displayState)}</span>
        {data.endsAt ? (
          <span>مهلت پاسخ‌گویی: {formatJalaliDateTime(data.endsAt)}</span>
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
          Nobino پاسخ نهایی ناشناس را به حساب کاربری شما پیوند نمی‌دهد؛ با این
          حال ناشناسی در سطح برنامه است و متن پاسخ‌های آزاد ممکن است هویت شما
          را فاش کند.
        </div>
      ) : null}

      {/* Response form or read-only display */}
      {data.canParticipate && !data.hasSubmitted ? (
        <SurveyResponseForm
          questions={data.questions}
          surveyId={data.id}
          userId={user.id}
          identityMode={data.identityMode}
          surveyKind={data.kind}
        />
      ) : data.questions.length > 0 ? (
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
