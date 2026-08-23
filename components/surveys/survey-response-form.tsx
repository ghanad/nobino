"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { loadDraftAction, saveDraftAction, type SaveDraftActionState } from "@/app/surveys/survey-draft-actions";
import {
  submitAnonymousResponseAction,
  submitResponseAction,
  type SubmitActionState,
} from "@/app/surveys/survey-submit-actions";
import { getDeterministicOptionOrder } from "@/lib/survey-service/option-order";
import {
  SURVEY_LONG_TEXT_MAX_LENGTH,
  SURVEY_SHORT_TEXT_MAX_LENGTH,
} from "@/lib/survey-response-limits";
import {
  getVisibleQuestionIds,
  clearHiddenAnswers,
  type AnswerValue,
  type QuestionWithCondition,
} from "@/lib/survey-response-utils";

type ResponseOption = {
  id: string;
  label: string;
  sortOrder: number;
};

type ResponseQuestion = {
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
  condition: { sourceQuestionId: string; sourceOptionId: string; operator: string } | null;
  options: ResponseOption[];
};

type SurveyResponseFormProps = {
  questions: ResponseQuestion[];
  surveyId: string;
  userId: string;
  identityMode: string;
  surveyKind: string;
};

export function SurveyResponseForm({
  questions,
  surveyId,
  userId,
  identityMode,
  surveyKind,
}: SurveyResponseFormProps) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [saveState, setSaveState] = useState<SaveDraftActionState>({ status: "idle" });
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitActionState>({ status: "idle" });
  const [isSubmitting, startSubmitTransition] = useTransition();
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestAnswersRef = useRef<Record<string, AnswerValue>>(answers);
  const hasUnsavedAnswersRef = useRef(false);
  const questionHeadingRef = useRef<HTMLParagraphElement>(null);

  // Keep ref in sync
  latestAnswersRef.current = answers;

  // Build a flat list of QuestionWithCondition for the visibility engine
  const visibilityQuestions: QuestionWithCondition[] = useMemo(
    () =>
      questions.map((q) => ({
        id: q.id,
        type: q.type as QuestionWithCondition["type"],
        required: q.required,
        condition: q.condition as QuestionWithCondition["condition"],
      })),
    [questions],
  );

  // Compute visible questions
  const visibleQuestionIds = useMemo(
    () => getVisibleQuestionIds(visibilityQuestions, answers),
    [visibilityQuestions, answers],
  );

  const visibleQuestions = useMemo(
    () => questions.filter((question) => visibleQuestionIds.has(question.id)),
    [questions, visibleQuestionIds],
  );
  const currentQuestion = visibleQuestions[Math.min(currentStep, Math.max(visibleQuestions.length - 1, 0))];
  const currentQuestionIndex = currentQuestion
    ? visibleQuestions.findIndex((question) => question.id === currentQuestion.id)
    : -1;
  const isLastQuestion = currentQuestionIndex === visibleQuestions.length - 1;

  useEffect(() => {
    setCurrentStep((step) => Math.min(step, Math.max(visibleQuestions.length - 1, 0)));
  }, [visibleQuestions.length]);

  useEffect(() => {
    if (initialLoaded && currentQuestion) {
      questionHeadingRef.current?.focus();
    }
  }, [currentQuestion?.id, initialLoaded]);

  useEffect(() => {
    if (saveState.status !== "saved") return;

    saveFeedbackTimerRef.current = setTimeout(() => {
      setSaveState((state) => (state.status === "saved" ? { status: "idle" } : state));
    }, 3000);

    return () => {
      if (saveFeedbackTimerRef.current) {
        clearTimeout(saveFeedbackTimerRef.current);
      }
    };
  }, [saveState.status]);

  // Clear hidden answers whenever visibility changes
  const visibleAnswers = useMemo(
    () => clearHiddenAnswers(visibilityQuestions, answers),
    [visibilityQuestions, answers],
  );

  // Sync answers when visibility clears hidden ones
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const syncedAnswers = useMemo(() => {
    const currentKeys = new Set(Object.keys(answers));
    const visibleKeys = new Set(Object.keys(visibleAnswers));
    let changed = false;
    for (const key of currentKeys) {
      if (!visibleKeys.has(key)) {
        changed = true;
        break;
      }
    }
    if (changed) {
      // Use a microtask to avoid setState during render
      setTimeout(() => setAnswers(visibleAnswers), 0);
    }
    return changed ? visibleAnswers : answers;
  }, [answers, visibleAnswers]);

  // Load draft on mount
  useEffect(() => {
    let cancelled = false;
    loadDraftAction(surveyId)
      .then(({ answers: draftAnswers }) => {
        if (cancelled) return;
        if (draftAnswers) {
          setAnswers(draftAnswers as Record<string, AnswerValue>);
        }
        setInitialLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSaveState({ status: "error", message: "امکان بارگذاری پیش‌نویس وجود ندارد. صفحه را تازه کنید." });
        setInitialLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId]);

  // Autosave with debounce when answers change
  useEffect(() => {
    if (!initialLoaded || !hasUnsavedAnswersRef.current) return;

    const timer = autoSaveTimerRef;
    let cancelled = false;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      setSaveState({ status: "saving" });
      const answersToSave = latestAnswersRef.current;
      const result = await saveDraftAction(
        { status: "saving" },
        {
          surveyId,
          answers: answersToSave as Record<string, unknown>,
        },
      );
      if (cancelled) return;
      if (result.status === "saved" && latestAnswersRef.current === answersToSave) {
        hasUnsavedAnswersRef.current = false;
      }
      setSaveState(result);
    }, 2000);

    return () => {
      cancelled = true;
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [answers, surveyId, initialLoaded]);

  const handleAnswer = useCallback(
    (questionId: string, value: AnswerValue) => {
      setStepError(null);
      setSaveState({ status: "idle" });
      hasUnsavedAnswersRef.current = true;
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        // Immediately recompute visible and clear hidden
        const visible = getVisibleQuestionIds(visibilityQuestions, next);
        for (const key of Object.keys(next)) {
          if (!visible.has(key)) {
            delete next[key];
          }
        }
        return next;
      });
    },
    [visibilityQuestions],
  );

  const handleSingleChoice = useCallback(
    (questionId: string, optionId: string) => {
      handleAnswer(questionId, syncedAnswers[questionId] === optionId ? null : optionId);
    },
    [handleAnswer, syncedAnswers],
  );

  const handleMultipleChoice = useCallback(
    (questionId: string, optionId: string) => {
      const current = Array.isArray(syncedAnswers[questionId]) ? (syncedAnswers[questionId] as string[]) : [];
      const next = current.includes(optionId)
        ? current.filter((v) => v !== optionId)
        : [...current, optionId];
      handleAnswer(questionId, next.length > 0 ? next : null);
    },
    [handleAnswer, syncedAnswers],
  );

  const handleRating = useCallback(
    (questionId: string, value: number) => {
      handleAnswer(questionId, syncedAnswers[questionId] === value ? null : value);
    },
    [handleAnswer, syncedAnswers],
  );

  const goToNextQuestion = useCallback(() => {
    if (!currentQuestion) return;

    if (currentQuestion.required && !hasAnswer(syncedAnswers[currentQuestion.id])) {
      setStepError("پاسخ به این سؤال الزامی است.");
      return;
    }

    setStepError(null);
    if (isLastQuestion) {
      setSubmitState({ status: "idle" });
      setShowConfirmation(true);
      return;
    }
    setCurrentStep((step) => Math.min(step + 1, visibleQuestions.length - 1));
  }, [currentQuestion, isLastQuestion, syncedAnswers, visibleQuestions.length]);

  const goToPreviousQuestion = useCallback(() => {
    setStepError(null);
    setShowConfirmation(false);
    setCurrentStep((step) => Math.max(step - 1, 0));
  }, []);

  const handleFinalSubmit = useCallback(() => {
    if (isSubmitting) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const action = identityMode === "ANONYMOUS"
      ? submitAnonymousResponseAction
      : submitResponseAction;
    const finalAnswers = clearHiddenAnswers(visibilityQuestions, latestAnswersRef.current);

    startSubmitTransition(async () => {
      const result = await action(
        { status: "idle" },
        { surveyId, answers: finalAnswers },
      );
      setSubmitState(result);
      if (result.status !== "success") {
        setShowConfirmation(true);
      }
    });
  }, [identityMode, isSubmitting, surveyId, visibilityQuestions]);

  if (submitState.status === "success") {
    return (
      <section
        aria-live="polite"
        className="rounded-md border border-green-200 bg-green-50 p-5 text-green-900"
        dir="rtl"
      >
        <h2 className="text-lg font-semibold">پاسخ شما ثبت شد</h2>
        <p className="mt-2 text-sm">سپاس از مشارکت شما. پاسخ نهایی قابل ویرایش نیست.</p>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[52rem] space-y-4" dir="rtl">
      {currentQuestion ? [currentQuestion].map((question) => {
        const isVisible = visibleQuestionIds.has(question.id);
        const showRequired = question.required && isVisible;
        const ratingMinLabel = question.ratingMinLabel ?? (
          surveyKind === "SATISFACTION" ? "خیلی ناراضی" : "کمترین امتیاز"
        );
        const ratingMaxLabel = question.ratingMaxLabel ?? (
          surveyKind === "SATISFACTION" ? "خیلی راضی" : "بیشترین امتیاز"
        );

        return (
          <div
            key={question.id}
            className={`space-y-5 rounded-lg border bg-card p-4 sm:p-6 ${
              isVisible ? "" : "hidden"
            }`}
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <p className="font-medium">
                    سؤال {currentQuestionIndex + 1} از {visibleQuestions.length}
                  </p>
                  {saveState.status !== "idle" ? (
                    <p
                      aria-live="polite"
                      className={saveState.status === "error" ? "text-destructive" : undefined}
                      role="status"
                    >
                      {saveState.status === "saving" ? "در حال ذخیره…" : null}
                      {saveState.status === "saved" ? "ذخیره شد" : null}
                      {saveState.status === "error" ? saveState.message ?? "خطا در ذخیره" : null}
                    </p>
                  ) : null}
                </div>
                <div
                  aria-hidden="true"
                  className="h-1 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                    style={{ width: `${((currentQuestionIndex + 1) / visibleQuestions.length) * 100}%` }}
                  />
                </div>
              </div>
              <p ref={questionHeadingRef} tabIndex={-1} className="text-base font-semibold leading-7 text-slate-950">
                {question.prompt}
                {showRequired ? (
                  <>
                    <span aria-hidden="true" className="mr-1 text-destructive">*</span>
                    <span className="sr-only"> (الزامی)</span>
                  </>
                ) : null}
              </p>
              {question.helpText ? (
                <p className="text-sm leading-6 text-muted-foreground">{question.helpText}</p>
              ) : null}
            </div>

            {/* SHORT_TEXT */}
            {question.type === "SHORT_TEXT" ? (
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                maxLength={SURVEY_SHORT_TEXT_MAX_LENGTH}
                placeholder="پاسخ خود را وارد کنید..."
                value={typeof syncedAnswers[question.id] === "string" ? (syncedAnswers[question.id] as string) : ""}
                onChange={(e) => handleAnswer(question.id, e.target.value || null)}
              />
            ) : null}

            {/* LONG_TEXT */}
            {question.type === "LONG_TEXT" ? (
              <textarea
                className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                maxLength={SURVEY_LONG_TEXT_MAX_LENGTH}
                placeholder="پاسخ خود را وارد کنید..."
                value={typeof syncedAnswers[question.id] === "string" ? (syncedAnswers[question.id] as string) : ""}
                onChange={(e) => handleAnswer(question.id, e.target.value || null)}
              />
            ) : null}

            {/* SINGLE_CHOICE or MULTIPLE_CHOICE */}
            {question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE" ? (
              <div className="space-y-2">
                {question.type === "MULTIPLE_CHOICE" && question.maxSelections ? (
                  <p className="text-xs text-muted-foreground">
                    حداکثر {question.maxSelections} گزینه می‌توانید انتخاب کنید.
                  </p>
                ) : null}
                {getDeterministicOptionOrder(
                  question.options,
                  surveyId,
                  question.id,
                  userId,
                  question.randomizeOptions,
                ).map((optionId) => {
                  const option = question.options.find((o) => o.id === optionId);
                  if (!option) return null;
                  const isSelected = question.type === "SINGLE_CHOICE"
                    ? syncedAnswers[question.id] === option.id
                    : Array.isArray(syncedAnswers[question.id]) &&
                      (syncedAnswers[question.id] as string[]).includes(option.id);

                  return (
                    <label
                      key={option.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent ${
                        isSelected ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      {question.type === "SINGLE_CHOICE" ? (
                        <input
                          checked={isSelected}
                          className="h-4 w-4 cursor-pointer"
                          name={`question_${question.id}`}
                          type="radio"
                          onChange={() => handleSingleChoice(question.id, option.id)}
                        />
                      ) : (
                        <input
                          checked={isSelected}
                          className="h-4 w-4 cursor-pointer"
                          type="checkbox"
                          onChange={() => handleMultipleChoice(question.id, option.id)}
                        />
                      )}
                      {option.label}
                    </label>
                  );
                })}
              </div>
            ) : null}

            {/* RATING */}
            {question.type === "RATING" ? (
              <div className="flex justify-center" role="group" aria-label={`امتیاز برای ${question.prompt}`}>
                <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-2 text-muted-foreground">
                  <span className="max-w-full text-xs leading-5">{ratingMinLabel}</span>
                  <div className="flex flex-wrap justify-center gap-2" aria-label="مقیاس امتیازدهی">
                    {Array.from(
                      {
                        length:
                          (question.ratingMax ?? 5) - (question.ratingMin ?? 1) + 1,
                      },
                      (_, i) => (question.ratingMin ?? 1) + i,
                    ).map((val) => {
                      const isSelected = syncedAnswers[question.id] === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          aria-label={`${val} از مقیاس ${ratingMinLabel} تا ${ratingMaxLabel}`}
                          aria-pressed={isSelected}
                          className={`flex h-11 w-11 items-center justify-center rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                              : "hover:border-primary hover:bg-primary/5"
                          }`}
                          onClick={() => handleRating(question.id, val)}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                  <span className="max-w-full text-xs leading-5">{ratingMaxLabel}</span>
                </div>
              </div>
            ) : null}
          </div>
        );
      }) : null}

      {!showConfirmation && currentQuestion ? (
        <section className="space-y-3 border-t pt-4" aria-label="پیمایش سؤال‌ها">
          {stepError ? (
            <p className="text-sm text-destructive" role="alert">{stepError}</p>
          ) : null}
          <div className="flex w-full items-center justify-between gap-3">
            <button
              type="button"
              className="min-h-11 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              disabled={currentQuestionIndex === 0 || isSubmitting}
              onClick={goToPreviousQuestion}
            >
              سؤال قبلی
            </button>
            <button
              type="button"
              className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!initialLoaded || isSubmitting}
              onClick={goToNextQuestion}
            >
              {isLastQuestion ? "ادامه و بازبینی پاسخ‌ها" : "سؤال بعدی"}
            </button>
          </div>
        </section>
      ) : null}

      <section className={showConfirmation ? "rounded-lg border bg-card p-5 sm:p-6" : "hidden"} aria-live="polite">
        {showConfirmation ? (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">ثبت نهایی پاسخ‌ها</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                پس از ثبت نهایی، پاسخ‌ها قابل ویرایش یا ارسال دوباره نیستند.
              </p>
            </div>
            {submitState.status === "error" || submitState.status === "conflict" ? (
              <p className="text-sm text-destructive" role="alert">{submitState.message}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting || !initialLoaded}
                onClick={handleFinalSubmit}
              >
                {isSubmitting ? "در حال ثبت..." : "تأیید و ثبت نهایی"}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                onClick={() => setShowConfirmation(false)}
              >
                بازگشت و ویرایش
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function hasAnswer(answer: AnswerValue | undefined): boolean {
  if (typeof answer === "string") return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return typeof answer === "number";
}
