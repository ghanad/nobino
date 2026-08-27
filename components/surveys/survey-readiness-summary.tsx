"use client";

import type { PublishReadinessReport } from "@/lib/survey-service/publish-readiness";

type SurveyReadinessSummaryProps = {
  report: PublishReadinessReport;
  surveyTitle: string;
  hasSchedule: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  schedule: "زمان‌بندی",
  audience: "مخاطبان",
  questions: "سوالات",
  branching: "شرط‌های نمایش",
  privacy: "حریم خصوصی",
};

export function SurveyReadinessSummary({
  report,
  surveyTitle,
  hasSchedule,
}: SurveyReadinessSummaryProps) {
  const errors = report.issues.filter((i) => i.severity === "error");

  return (
    <section className="space-y-3 border-t pt-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">آمادگی انتشار</h3>
        {report.ready ? (
          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            آماده انتشار
          </span>
        ) : (
          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
            {errors.length} مشکل برای انتشار
          </span>
        )}
      </div>

      <p className="text-xs leading-6 text-muted-foreground">
        {report.questionCount} سؤال · {report.recipientCount} دریافت‌کننده · {hasSchedule ? "زمان‌بندی تنظیم شده" : "بدون زمان‌بندی"} · {report.isVoteKind ? "رای‌گیری" : "نوع عادی"}
      </p>

      {/* Issues list grouped by category */}
      {report.issues.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            موارد قابل توجه:
          </p>
          {Object.entries(
            report.issues.reduce(
              (acc, issue) => {
                const cat = issue.category;
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(issue);
                return acc;
              },
              {} as Record<string, typeof report.issues>,
            ),
          ).map(([category, categoryIssues]) => (
            <div key={category} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {CATEGORY_LABELS[category] ?? category}:
              </p>
              {categoryIssues.map((issue, idx) => (
                <p
                  key={idx}
                  className={`border-r pr-2 text-xs leading-5 ${
                    issue.severity === "error"
                      ? "border-red-300 text-red-700"
                      : "border-amber-300 text-amber-800"
                  }`}
                >
                  {issue.message}
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          نظرسنجی &ldquo;{surveyTitle}&rdquo; آماده انتشار است.
        </p>
      )}
    </section>
  );
}
