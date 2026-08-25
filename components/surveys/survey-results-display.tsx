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
            <ChoiceResults
              choices={question.choices}
              questionType={question.type}
              submittedCount={results.participation.submittedCount}
            />
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

// Donut charts are reserved for single-choice questions with few options, where
// slices form an honest part-to-whole picture; multi-select and long option
// lists compare better as horizontal bars.
function ChoiceResults({
  choices,
  questionType,
  submittedCount,
}: {
  choices: NonNullable<SurveyResultsAvailable["questions"][number]["choices"]>;
  questionType: SurveyResultsAvailable["questions"][number]["type"];
  submittedCount: number;
}) {
  const answeredTotal = choices.reduce((sum, choice) => sum + choice.count, 0);

  if (answeredTotal === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">هنوز پاسخی برای این پرسش ثبت نشده است.</p>;
  }

  // Single-choice shares sum to the answered total (part-to-whole). Multi-select
  // penetration is measured against submissions, so totals may exceed 100%.
  const denominator = questionType === "SINGLE_CHOICE" ? answeredTotal : submittedCount;
  const stats: ChoiceStat[] = choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    count: choice.count,
    ratio: denominator === 0 ? 0 : choice.count / denominator,
  }));

  const useDonut = questionType === "SINGLE_CHOICE" && choices.length >= 2 && choices.length <= 4;

  return useDonut ? (
    <ChoiceDonut stats={stats} total={answeredTotal} />
  ) : (
    <ChoiceBars stats={stats} denominator={denominator} />
  );
}

type ChoiceStat = {
  id: string;
  label: string;
  count: number;
  ratio: number;
};

const DONUT_SEGMENT_COLORS = [
  "hsl(221.2 83.2% 53.3%)",
  "hsl(173.4 80.4% 32%)",
  "hsl(32.1 94.6% 43.7%)",
  "hsl(215.3 19% 36.7%)",
];

function ChoiceDonut({ stats, total }: { stats: ChoiceStat[]; total: number }) {
  const visibleCount = stats.filter((stat) => stat.count > 0).length;
  const gap = visibleCount > 1 ? 1.5 : 0;

  let start = 0;
  const arcs = stats.map((stat, index) => {
    const arcStart = start;
    start += stat.ratio * 100;
    return { ...stat, arcStart, color: DONUT_SEGMENT_COLORS[index % DONUT_SEGMENT_COLORS.length] };
  });

  return (
    <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
      <div
        aria-label={`توزیع ${formatInteger(total)} پاسخ میان ${formatInteger(stats.length)} گزینه`}
        className="relative mx-auto aspect-square w-40 shrink-0 sm:mx-0"
        role="img"
      >
        <svg viewBox="0 0 42 42" className="size-full -rotate-90">
          <circle cx="21" cy="21" fill="none" r="15.9155" strokeWidth="5" className="stroke-[hsl(var(--muted))]" />
          {arcs.map((arc) =>
            arc.count === 0 ? null : (
              <circle
                cx="21"
                cy="21"
                fill="none"
                key={arc.id}
                r="15.9155"
                stroke={arc.color}
                strokeWidth="5"
                {...(arc.ratio > 0.999
                  ? {}
                  : {
                      strokeDasharray: `${Math.max(arc.ratio * 100 - gap, 0.5)} ${100 - Math.max(arc.ratio * 100 - gap, 0.5)}`,
                      strokeDashoffset: -(arc.arcStart + gap / 2),
                    })}
              />
            ),
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-semibold leading-none tabular-nums text-foreground">{formatInteger(total)}</span>
          <span className="mt-1 text-xs text-muted-foreground">پاسخ</span>
        </div>
      </div>

      <ul aria-label="توزیع گزینه‌ها" className="min-w-0 flex-1 space-y-2.5">
        {arcs.map((arc) => (
          <li className="flex items-start gap-2.5 text-sm" key={arc.id}>
            <span
              className={`mt-[7px] size-2 shrink-0 rounded-full ${arc.count === 0 ? "border border-input bg-transparent" : ""}`}
              style={{ backgroundColor: arc.count === 0 ? undefined : arc.color }}
            />
            <span className={`min-w-0 flex-1 leading-5 ${arc.count === 0 ? "text-muted-foreground" : "font-medium text-foreground"}`}>
              {arc.label}
            </span>
            <span className="shrink-0 leading-5 tabular-nums text-muted-foreground">
              {formatInteger(arc.count)} پاسخ<span aria-hidden="true"> · </span>{PERCENT_FORMATTER.format(arc.ratio)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChoiceBars({ stats, denominator }: { stats: ChoiceStat[]; denominator: number }) {
  return (
    <ul aria-label="توزیع گزینه‌ها" className="mt-4 space-y-3">
      {stats.map((stat) => (
        <li key={stat.id}>
          <div className="flex items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <span className={stat.count === 0 ? "leading-5 text-muted-foreground" : "font-medium leading-5 text-foreground"}>
              {stat.label}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatInteger(stat.count)} پاسخ<span aria-hidden="true"> · </span>{PERCENT_FORMATTER.format(stat.ratio)}
            </span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${stat.label}: ${formatInteger(stat.count)} پاسخ`}
            aria-valuemax={denominator}
            aria-valuemin={0}
            aria-valuenow={stat.count}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(stat.ratio * 100, 100)}%` }} />
          </div>
        </li>
      ))}
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
