import type { SurveyResults, SurveyResultsAvailable } from "@/lib/survey-service/results";
import { getSurveyDisplayStateLabel, getSurveyKindLabel, getSurveyIdentityLabel } from "@/lib/survey-status";

import { formatJalaliDateTime } from "@/lib/jalali-date";

const INTEGER_FORMATTER = new Intl.NumberFormat("fa-IR");
const DECIMAL_FORMATTER = new Intl.NumberFormat("fa-IR", {
  maximumFractionDigits: 1,
});
const PERCENT_FORMATTER = new Intl.NumberFormat("fa-IR", {
  maximumFractionDigits: 1,
  style: "percent",
});

type SurveyResultsDisplayProps = {
  results: SurveyResults;
};

export function SurveyResultsDisplay({ results }: SurveyResultsDisplayProps) {
  const { survey, participation } = results;
  const responseRate = participation.responseRate === null
    ? "—"
    : PERCENT_FORMATTER.format(participation.responseRate);

  return (
    <div className="space-y-6" dir="rtl">
      <section className="rounded-lg border bg-card p-4 sm:p-6" aria-labelledby="results-overview-heading">
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold" id="results-overview-heading">
              نمای کلی مشارکت
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {getSurveyKindLabel(survey.kind)} · {getSurveyIdentityLabel(survey.identityMode)} · {getSurveyDisplayStateLabel(survey.displayState)}
            </p>
          </div>
          <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {getSurveyDisplayStateLabel(survey.displayState)}
          </span>
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <ResultMetric label="مخاطبان" value={formatInteger(participation.recipientCount)} />
          <ResultMetric label="پاسخ‌های ثبت‌شده" value={formatInteger(participation.submittedCount)} />
          <ResultMetric label="نرخ مشارکت" value={responseRate} />
        </dl>
      </section>

      {results.availability === "VOTE_EMBARGO" ? <VoteEmbargo /> : null}
      {results.availability === "ANONYMOUS_PRIVACY_THRESHOLD" ? <PrivacyThreshold count={participation.submittedCount} /> : null}
      {results.availability === "AVAILABLE" ? <AvailableResults results={results} /> : null}
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function VoteEmbargo() {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:p-6" aria-labelledby="vote-embargo-heading">
      <h2 className="text-lg font-semibold" id="vote-embargo-heading">نتایج رأی‌گیری هنوز محرمانه است</h2>
      <p className="mt-2 text-sm leading-6">
        تا پایان یا بسته‌شدن رأی‌گیری، فقط تعداد مشارکت قابل مشاهده است. پاسخ‌ها و آمار گزینه‌ها برای همه نقش‌ها پنهان می‌ماند.
      </p>
    </section>
  );
}

function PrivacyThreshold({ count }: { count: number }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:p-6" aria-labelledby="privacy-threshold-heading">
      <h2 className="text-lg font-semibold" id="privacy-threshold-heading">نتایج ناشناس هنوز قابل نمایش نیست</h2>
      <p className="mt-2 text-sm leading-6">
        برای حفظ ناشناس‌ماندن پاسخ‌دهندگان، جزئیات نتایج پس از ثبت حداقل ۵ پاسخ نمایش داده می‌شود. اکنون {formatInteger(count)} پاسخ ثبت شده است.
      </p>
    </section>
  );
}

function AvailableResults({ results }: { results: SurveyResultsAvailable }) {
  return (
    <section className="space-y-4" aria-label="نتایج پرسش‌ها">
      {results.questions.map((question, index) => (
        <article className="rounded-lg border bg-card p-4 sm:p-6" key={question.id}>
          <h2 className="text-base font-semibold leading-7">
            {formatInteger(index + 1)}. {question.prompt}
          </h2>

          {question.choices ? (
            <ChoiceResults choices={question.choices} submittedCount={results.participation.submittedCount} />
          ) : null}
          {question.rating ? <RatingResults rating={question.rating} /> : null}
          {question.textAnswers.length > 0 ? (
            <TextAnswers answers={question.textAnswers} anonymous={results.survey.identityMode === "ANONYMOUS"} />
          ) : null}
          {!question.choices && !question.rating && question.textAnswers.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">هنوز پاسخی برای این پرسش ثبت نشده است.</p>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function ChoiceResults({
  choices,
  submittedCount,
}: {
  choices: NonNullable<SurveyResultsAvailable["questions"][number]["choices"]>;
  submittedCount: number;
}) {
  return (
    <ul className="mt-4 space-y-3" aria-label="توزیع گزینه‌ها">
      {choices.map((choice) => {
        const ratio = submittedCount === 0 ? 0 : choice.count / submittedCount;
        return (
          <li key={choice.id}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-medium">{choice.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatInteger(choice.count)} پاسخ ({PERCENT_FORMATTER.format(ratio)})
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${choice.label}: ${formatInteger(choice.count)} پاسخ`} aria-valuemax={submittedCount} aria-valuemin={0} aria-valuenow={choice.count}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RatingResults({
  rating,
}: {
  rating: NonNullable<SurveyResultsAvailable["questions"][number]["rating"]>;
}) {
  // Percentages are relative to answered ratings, not submissions, so skipped
  // questions do not dilute the distribution.
  const total = rating.distribution.reduce((sum, item) => sum + item.count, 0);
  const hasResponses = total > 0;

  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {rating.average === null ? "—" : formatDecimal(rating.average)}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums" aria-hidden="true">
          / {formatInteger(rating.max)}
        </span>
        <span className="text-sm text-muted-foreground">میانگین امتیاز</span>
      </div>

      {hasResponses ? (
        <>
          <ul className="mt-4 space-y-2" aria-label={`توزیع امتیاز از ${formatInteger(rating.min)} تا ${formatInteger(rating.max)}`}>
            {rating.distribution.map((item) => {
              const ratio = item.count / total;
              return (
                <li className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 text-sm" key={item.value}>
                  <span className={`tabular-nums ${item.count === 0 ? "text-muted-foreground" : "font-medium text-foreground"}`}>
                    {formatInteger(item.value)}
                  </span>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`امتیاز ${formatInteger(item.value)}: ${formatInteger(item.count)} پاسخ`}
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={item.count}
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatInteger(item.count)} پاسخ<span aria-hidden="true"> · </span>{PERCENT_FORMATTER.format(ratio)}
                  </span>
                </li>
              );
            })}
          </ul>
          {rating.minLabel || rating.maxLabel ? (
            <div className="mt-2 flex justify-between gap-4 text-xs text-muted-foreground">
              <span>{rating.minLabel}</span>
              <span>{rating.maxLabel}</span>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">هنوز پاسخی برای این پرسش ثبت نشده است.</p>
      )}
    </div>
  );
}

function TextAnswers({
  answers,
  anonymous,
}: {
  answers: SurveyResultsAvailable["questions"][number]["textAnswers"];
  anonymous: boolean;
}) {
  return (
    <div className="mt-4 space-y-3" aria-label="پاسخ‌های متنی">
      {answers.map((answer, index) => {
        const namedAnswer = !anonymous && "respondent" in answer ? answer : null;
        return (
          <blockquote className="rounded-md border bg-muted/30 p-3 text-sm leading-7" key={`${answer.text}-${index}`}>
            <p className="whitespace-pre-wrap text-foreground">{answer.text}</p>
            {namedAnswer?.respondent ? (
              <footer className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                {namedAnswer.respondent.name} · {namedAnswer.respondent.email} · {formatJalaliDateTime(namedAnswer.submittedAt)}
              </footer>
            ) : null}
          </blockquote>
        );
      })}
    </div>
  );
}

function formatInteger(value: number): string {
  return INTEGER_FORMATTER.format(value);
}

function formatDecimal(value: number): string {
  return DECIMAL_FORMATTER.format(value);
}
