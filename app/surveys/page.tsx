import { canCreateSurvey } from "@/lib/permissions";
import { requireCurrentUser } from "@/lib/auth";
import {
  listAuthoringSurveys,
  listRespondentSurveys,
} from "@/lib/survey-service/metadata";
import {
  getSurveyDisplayState,
  getSurveyDisplayStateLabel,
  getSurveyKindLabel,
  getSurveyIdentityLabel,
  type SurveyDisplayState,
} from "@/lib/survey-status";
import { formatJalaliDateTime } from "@/lib/jalali-date";
import { groupSurveyNavigation } from "@/lib/survey-list";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { PlusIcon } from "lucide-react";

type SurveyForList = Awaited<
  ReturnType<typeof listRespondentSurveys>
>[number];
type AuthoringSurveyForList = Awaited<
  ReturnType<typeof listAuthoringSurveys>
>[number];

function SurveyCard({
  survey,
  displayState,
  showStatus = true,
  showKind = false,
  showIdentity = false,
  hasSubmitted,
}: {
  survey: SurveyForList | AuthoringSurveyForList;
  displayState: SurveyDisplayState;
  showStatus?: boolean;
  showKind?: boolean;
  showIdentity?: boolean;
  hasSubmitted?: boolean;
}) {
  const timeLabel =
    displayState === "DRAFT"
      ? `آخرین ویرایش: ${formatJalaliDateTime(survey.updatedAt)}`
      : survey.startsAt
        ? `شروع: ${formatJalaliDateTime(survey.startsAt)}`
        : null;

  const endLabel = survey.endsAt
    ? `پایان: ${formatJalaliDateTime(survey.endsAt)}`
    : null;

  return (
    <Link
      href={`/surveys/${survey.id}`}
      className="flex flex-col gap-1 rounded-lg border p-4 text-right transition-colors hover:bg-muted/50"
      dir="rtl"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium leading-tight text-foreground">
          {survey.title}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {showStatus && displayState !== "DRAFT" ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {getSurveyDisplayStateLabel(displayState)}
            </span>
          ) : null}
          {showStatus && displayState === "DRAFT" ? (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              پیش‌نویس
            </span>
          ) : null}
          {hasSubmitted === true ? (
            <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
              پاسخ داده‌اید
            </span>
          ) : null}
        </div>
      </div>
      {survey.description ? (
        <p className="line-clamp-1 text-sm text-muted-foreground">
          {survey.description}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {showKind ? <span>{getSurveyKindLabel(survey.kind)}</span> : null}
        {showIdentity ? (
          <span>{getSurveyIdentityLabel(survey.identityMode)}</span>
        ) : null}
        {timeLabel ? <span>{timeLabel}</span> : null}
        {endLabel ? <span>{endLabel}</span> : null}
      </div>
    </Link>
  );
}

function SurveySection({
  title,
  surveys,
  showKind = false,
  showIdentity = false,
  showStatus = true,
  getHasSubmitted,
}: {
  title: string;
  surveys: (SurveyForList | AuthoringSurveyForList)[];
  showKind?: boolean;
  showIdentity?: boolean;
  showStatus?: boolean;
  getHasSubmitted?: (s: SurveyForList | AuthoringSurveyForList) => boolean;
}) {
  if (surveys.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {surveys.map((survey) => {
          const now = new Date();
          const displayState = getSurveyDisplayState(survey, now);
          return (
            <SurveyCard
              key={survey.id}
              survey={survey}
              displayState={displayState}
              showStatus={showStatus}
              showKind={showKind}
              showIdentity={showIdentity}
              hasSubmitted={getHasSubmitted?.(survey)}
            />
          );
        })}
      </div>
    </section>
  );
}

export default async function SurveysPage() {
  const user = await requireCurrentUser();
  const canCreate = canCreateSurvey(user);

  const [respondentSurveys, authoringSurveys] = await Promise.all([
    listRespondentSurveys({ actorUserId: user.id }),
    listAuthoringSurveys({ actorUserId: user.id }),
  ]);

  const now = new Date();
  const {
    availableToAnswer,
    completed,
    ended,
    managed,
  } = groupSurveyNavigation({
    respondentSurveys,
    authoringSurveys,
    now,
  });

  const hasAnyContent =
    availableToAnswer.length > 0 ||
    completed.length > 0 ||
    managed.length > 0 ||
    ended.length > 0;

  return (
    <div className="space-y-8" dir="rtl">
      <PageHeader
        title="نظرسنجی‌ها"
        subtitle={
          hasAnyContent
            ? "نظرسنجی‌های در دسترس و مدیریت شده"
            : "هنوز نظرسنجی‌ای برای شما ثبت نشده است"
        }
        actions={
          canCreate
            ? (
              <Link href="/surveys/new">
                <Button>
                  <PlusIcon className="ml-1.5 h-4 w-4" />
                  نظرسنجی جدید
                </Button>
              </Link>
            )
            : undefined
        }
      />

      {!hasAnyContent ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-muted-foreground">
            در حال حاضر هیچ نظرسنجی فعالی برای شما وجود ندارد.
          </p>
          {canCreate ? (
            <p className="text-sm text-muted-foreground">
              برای ایجاد نظرسنجی جدید، روی دکمه &ldquo;نظرسنجی جدید&rdquo;
              کلیک کنید.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <SurveySection
            title="در دسترس برای پاسخ"
            surveys={availableToAnswer}
            showKind
            showIdentity
          />
          <SurveySection
            title="پاسخ داده شده"
            surveys={completed}
            showKind
            showIdentity
            getHasSubmitted={() => true}
          />
          <SurveySection
            title="پایان یافته"
            surveys={ended}
            showKind
            showIdentity
          />
          {managed.length > 0 ? (
            <SurveySection
              title="ساخته‌شده یا در حال همکاری"
              surveys={managed}
              showStatus
              showKind
              showIdentity
            />
          ) : null}
        </>
      )}
    </div>
  );
}
