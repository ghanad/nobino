"use client";

import { useEffect, useMemo, useState } from "react";

import type { SurveyQuestionType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  clearHiddenAnswers,
  getVisibleQuestionIds,
  type AnswerValue,
  type QuestionWithCondition,
} from "@/lib/survey-response-utils";

type PreviewOption = {
  id: string;
  label: string;
};

type PreviewCondition = {
  sourceQuestionId: string;
  sourceQuestionPrompt: string;
  sourceOptionId: string;
  sourceOptionLabel: string;
  operator: "IS_SELECTED" | "IS_NOT_SELECTED";
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
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [previewComplete, setPreviewComplete] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const visibilityQuestions = useMemo<QuestionWithCondition[]>(
    () =>
      questions.map((question) => ({
        id: question.id,
        type: question.type,
        required: question.required,
        condition: question.condition
          ? {
              sourceQuestionId: question.condition.sourceQuestionId,
              sourceOptionId: question.condition.sourceOptionId,
              operator: question.condition.operator,
            }
          : null,
      })),
    [questions],
  );
  const visibleQuestionIds = useMemo(
    () => getVisibleQuestionIds(visibilityQuestions, answers),
    [answers, visibilityQuestions],
  );
  const visibleQuestions = questions.filter((question) =>
    visibleQuestionIds.has(question.id),
  );
  const currentQuestion = visibleQuestions[currentStep];
  const isLastQuestion = currentStep === visibleQuestions.length - 1;

  useEffect(() => {
    setCurrentStep((step) =>
      Math.min(step, Math.max(visibleQuestions.length - 1, 0)),
    );
  }, [visibleQuestions.length]);

  const updateAnswer = (questionId: string, value: AnswerValue) => {
    setPreviewComplete(false);
    setStepError(null);
    setAnswers((currentAnswers) =>
      clearHiddenAnswers(visibilityQuestions, {
        ...currentAnswers,
        [questionId]: value,
      }),
    );
  };
  const getTextAnswer = (questionId: string) => {
    const answer = answers[questionId];
    return typeof answer === "string" ? answer : "";
  };
  const goToNextQuestion = () => {
    if (!currentQuestion) {
      return;
    }

    if (currentQuestion.required && !hasAnswer(answers[currentQuestion.id])) {
      setStepError("پاسخ به این سؤال الزامی است.");
      return;
    }

    setStepError(null);
    if (isLastQuestion) {
      setPreviewComplete(true);
      return;
    }
    setCurrentStep((step) => step + 1);
  };

  return (
    <form className="space-y-6" dir="rtl" onSubmit={(event) => event.preventDefault()}>
      <div className="space-y-2 border-b pb-5">
        <h3 className="text-lg font-semibold sm:text-xl">{title}</h3>
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
        {currentQuestion ? [currentQuestion].map((question) => (
          <div
            key={question.id}
            className="space-y-4 rounded-lg border bg-card p-4 sm:p-5"
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

            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  سؤال {currentStep + 1} از {visibleQuestions.length}
                </p>
                <div
                  aria-hidden="true"
                  className="h-1 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                    style={{
                      width: `${((currentStep + 1) / visibleQuestions.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <p className="text-sm font-medium">
                {question.prompt}
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

            {question.type === "SHORT_TEXT" ? (
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) => updateAnswer(question.id, event.target.value)}
                placeholder="پاسخ کوتاه"
                type="text"
                value={getTextAnswer(question.id)}
              />
            ) : null}

            {question.type === "LONG_TEXT" ? (
              <textarea
                className="min-h-[80px] w-full rounded-md border border-input bg-background p-3 text-sm"
                onChange={(event) => updateAnswer(question.id, event.target.value)}
                placeholder="پاسخ بلند"
                value={getTextAnswer(question.id)}
              />
            ) : null}

            {question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE" ? (
              <div className="space-y-2">
                {question.type === "MULTIPLE_CHOICE" && question.maxSelections ? (
                  <p className="text-xs text-muted-foreground">
                    حداکثر {question.maxSelections} گزینه می‌توانید انتخاب کنید.
                  </p>
                ) : null}
                {question.options.map((option) => {
                  const selectedValues: string[] = Array.isArray(
                    answers[question.id],
                  )
                    ? (answers[question.id] as string[])
                    : [];
                  const isSelected =
                    question.type === "SINGLE_CHOICE"
                      ? answers[question.id] === option.id
                      : selectedValues.includes(option.id);
                  const hasReachedSelectionLimit =
                    question.type === "MULTIPLE_CHOICE" &&
                    question.maxSelections !== null &&
                    selectedValues.length >= question.maxSelections &&
                    !isSelected;

                  return (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 hover:bg-accent/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                    >
                      {question.type === "SINGLE_CHOICE" ? (
                      <input
                        checked={isSelected}
                        className="h-4 w-4"
                        name={`question_${question.id}`}
                        onChange={() => updateAnswer(question.id, option.id)}
                        type="radio"
                      />
                    ) : (
                      <input
                        checked={isSelected}
                        className="h-4 w-4"
                        disabled={hasReachedSelectionLimit}
                        onChange={(event) => {
                          const nextValues = event.target.checked
                            ? [...selectedValues, option.id]
                            : selectedValues.filter((value) => value !== option.id);
                          updateAnswer(question.id, nextValues);
                        }}
                        type="checkbox"
                      />
                    )}
                    {option.label}
                  </label>
                  );
                })}
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
                        aria-pressed={answers[question.id] === val}
                        key={val}
                        className={`flex h-9 w-9 items-center justify-center rounded-md border text-sm transition-colors ${answers[question.id] === val ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                        onClick={() => updateAnswer(question.id, val)}
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
        )) : (
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            هنوز سوالی برای پیش‌نمایش اضافه نشده است.
          </div>
        )}
      </div>

      {currentQuestion && !previewComplete ? (
        <section aria-label="پیمایش سؤال‌ها" className="space-y-3 border-t pt-4">
          {stepError ? <p className="text-sm text-destructive" role="alert">{stepError}</p> : null}
          <div className="flex items-center justify-between gap-3">
            <Button
              disabled={currentStep === 0}
              onClick={() => {
                setStepError(null);
                setCurrentStep((step) => Math.max(step - 1, 0));
              }}
              type="button"
              variant="outline"
            >
              سؤال قبلی
            </Button>
            <Button onClick={goToNextQuestion} type="button">
              {isLastQuestion ? "اتمام پیش‌نمایش" : "سؤال بعدی"}
            </Button>
          </div>
        </section>
      ) : null}

      {previewComplete ? (
        <section aria-live="polite" className="rounded-lg border bg-card p-5 sm:p-6">
          <h4 className="text-base font-semibold">پیش‌نمایش کامل شد</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            هیچ‌یک از پاسخ‌های واردشده ثبت نخواهند شد.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              setPreviewComplete(false);
              setCurrentStep(Math.max(visibleQuestions.length - 1, 0));
            }}
            type="button"
            variant="outline"
          >
            بازگشت به سؤال آخر
          </Button>
        </section>
      ) : null}

      <div
        className="rounded-md border border-dashed px-4 py-3 text-center text-sm text-muted-foreground"
        id="survey-preview-note"
      >
        این پیش‌نمایش تعاملی است. پاسخ‌ها فقط در همین صفحه نگه داشته می‌شوند و
        ثبت نخواهند شد.
      </div>
    </form>
  );
}

function hasAnswer(answer: AnswerValue | undefined): boolean {
  if (typeof answer === "string") return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return typeof answer === "number";
}
