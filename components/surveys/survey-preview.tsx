"use client";

import type { SurveyQuestionType } from "@prisma/client";

type PreviewOption = {
  id: string;
  label: string;
};

type PreviewCondition = {
  sourceQuestionPrompt: string;
  sourceOptionLabel: string;
  operator: string;
};

type PreviewQuestion = {
  id: string;
  prompt: string;
  helpText: string | null;
  type: SurveyQuestionType;
  required: boolean;
  sortOrder: number;
  randomizeOptions: boolean;
  ratingMin: number | null;
  ratingMax: number | null;
  ratingMinLabel: string | null;
  ratingMaxLabel: string | null;
  maxSelections: number | null;
  options: PreviewOption[];
  condition: PreviewCondition | null;
};

type SurveyPreviewProps = {
  title: string;
  description: string | null;
  questions: PreviewQuestion[];
  identityMode: string;
  isAnonymous: boolean;
};

export function SurveyPreview({
  title,
  description,
  questions,
  identityMode,
  isAnonymous,
}: SurveyPreviewProps) {
  return (
    <div className="space-y-6 rounded-lg border bg-card p-6" dir="rtl">
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          حالت: {identityMode === "NAMED" ? "مشخص" : "ناشناس"}
        </p>
        {isAnonymous ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            پاسخ‌ها به صورت ناشناس ثبت می‌شوند. پاسخ شما قابل ردیابی نیست.
            متن پاسخ‌های آزاد ممکن است هویت شما را فاش کنند.
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {questions.map((question, index) => (
          <div
            key={question.id}
            className="space-y-3 rounded-md border bg-background p-4"
          >
            {question.condition ? (
              <p className="text-xs text-muted-foreground">
                (تنها در صورتی نمایش داده می‌شود که در سوال &ldquo;
                {question.condition.sourceQuestionPrompt}
                &rdquo; گزینه &ldquo;
                {question.condition.sourceOptionLabel}
                &rdquo; را انتخاب کرده باشید)
              </p>
            ) : null}

            <div className="space-y-1">
              <p className="text-sm font-medium">
                {index + 1}. {question.prompt}
                {question.required ? (
                  <span className="mr-1 text-red-500">*</span>
                ) : null}
              </p>
              {question.helpText ? (
                <p className="text-xs text-muted-foreground">
                  {question.helpText}
                </p>
              ) : null}
            </div>

            {/* Render question type preview */}
            {question.type === "SHORT_TEXT" ? (
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled
                placeholder="پاسخ کوتاه"
                type="text"
              />
            ) : null}

            {question.type === "LONG_TEXT" ? (
              <textarea
                className="min-h-[80px] w-full rounded-md border border-input bg-background p-3 text-sm"
                disabled
                placeholder="پاسخ بلند"
              />
            ) : null}

            {question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE" ? (
              <div className="space-y-2">
                {question.type === "MULTIPLE_CHOICE" && question.maxSelections ? (
                  <p className="text-xs text-muted-foreground">
                    حداکثر {question.maxSelections} گزینه می‌توانید انتخاب کنید.
                  </p>
                ) : null}
                {question.options.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-not-allowed items-center gap-2 rounded-md border p-3 text-sm"
                  >
                    {question.type === "SINGLE_CHOICE" ? (
                      <input
                        checked={false}
                        className="h-4 w-4"
                        disabled
                        name={`question_${question.id}`}
                        type="radio"
                      />
                    ) : (
                      <input
                        checked={false}
                        className="h-4 w-4"
                        disabled
                        type="checkbox"
                      />
                    )}
                    {option.label}
                  </label>
                ))}
              </div>
            ) : null}

            {question.type === "RATING" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {question.ratingMinLabel ? (
                    <span className="text-xs text-muted-foreground">
                      {question.ratingMinLabel}
                    </span>
                  ) : null}
                  <div className="flex gap-1">
                    {Array.from(
                      {
                        length:
                          (question.ratingMax ?? 5) - (question.ratingMin ?? 1) + 1,
                      },
                      (_, i) => (question.ratingMin ?? 1) + i,
                    ).map((val) => (
                      <button
                        key={val}
                        className="flex h-9 w-9 items-center justify-center rounded-md border text-sm text-muted-foreground"
                        disabled
                        type="button"
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  {question.ratingMaxLabel ? (
                    <span className="text-xs text-muted-foreground">
                      {question.ratingMaxLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        این یک پیش‌نمایش است. پاسخی ثبت نخواهد شد.
      </div>
    </div>
  );
}
