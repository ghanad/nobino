"use client";

import { getSurveyDisplayStateLabel } from "@/lib/survey-status";
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
  const warnings = report.issues.filter((i) => i.severity === "warning");

  return (
    <div className="space-y-4 rounded-lg border p-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">آمادگی انتشار</h3>
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

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md bg-muted p-2 text-center">
          <p className="font-semibold">{report.questionCount}</p>
          <p className="text-muted-foreground">سوال</p>
        </div>
        <div className="rounded-md bg-muted p-2 text-center">
          <p className="font-semibold">{report.recipientCount}</p>
          <p className="text-muted-foreground">دریافت‌کننده</p>
        </div>
        <div className="rounded-md bg-muted p-2 text-center">
          <p className="font-semibold">
            {hasSchedule ? "تنظیم شده" : "تنظیم نشده"}
          </p>
          <p className="text-muted-foreground">زمان‌بندی</p>
        </div>
        <div className="rounded-md bg-muted p-2 text-center">
          <p className="font-semibold">
            {report.isVoteKind ? "رای‌گیری" : "عادی"}
          </p>
          <p className="text-muted-foreground">نوع</p>
        </div>
      </div>

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
                <div
                  key={idx}
                  className={`flex items-start gap-2 rounded-md px-3 py-1.5 text-xs ${
                    issue.severity === "error"
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {issue.severity === "error" ? "⚠" : "ℹ"}
                  </span>
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          نظرسنجی &ldquo;{surveyTitle}&rdquo; آماده انتشار است.
        </p>
      )}
    </div>
  );
}
