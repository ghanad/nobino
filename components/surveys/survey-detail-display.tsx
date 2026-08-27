"use client";

type DetailOption = {
  id: string;
  label: string;
  sortOrder: number;
};

type DetailQuestion = {
  id: string;
  prompt: string;
  helpText: string | null;
  type: string;
  required: boolean;
  sortOrder: number;
  randomizeOptions: boolean;
  ratingMin: number | null;
  ratingMax: number | null;
  ratingMinLabel: string | null;
  ratingMaxLabel: string | null;
  maxSelections: number | null;
  options: DetailOption[];
};

type SurveyDetailDisplayProps = {
  questions: DetailQuestion[];
  hasSubmitted: boolean;
  displayState: string;
};

/**
 * Read-only display of survey questions for the recipient-facing page.
 * No response form is rendered here — this is purely a view-only component.
 * The response form will be added in S19+.
 */
export function SurveyDetailDisplay({
  questions,
  hasSubmitted,
  displayState,
}: SurveyDetailDisplayProps) {
  const isReadOnly =
    hasSubmitted ||
    displayState !== "ACTIVE";

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">سوالات</h2>

      {questions.map((question, index) => (
        <div
          key={question.id}
          className="space-y-3 rounded-md border bg-card p-4"
        >
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

          {/* Render question type */}
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
            <div className="max-w-full overflow-x-auto">
              <div className="grid min-w-[17.75rem] w-max grid-cols-2 gap-x-3 text-xs leading-5 text-muted-foreground">
                <span className="min-w-0 text-right">
                  {question.ratingMinLabel}
                </span>
                <span className="min-w-0 text-left">
                  {question.ratingMaxLabel}
                </span>
                <div className="col-span-2 flex justify-between gap-1">
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
              </div>
            </div>
          ) : null}
        </div>
      ))}

      {isReadOnly ? (
        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {hasSubmitted
            ? "شما قبلاً به این نظرسنجی پاسخ داده‌اید."
            : "در حال حاضر امکان ثبت پاسخ وجود ندارد."}
        </div>
      ) : null}
    </div>
  );
}
