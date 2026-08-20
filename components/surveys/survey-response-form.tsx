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
};

export function SurveyResponseForm({
  questions,
  surveyId,
  userId,
  identityMode,
}: SurveyResponseFormProps) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [saveState, setSaveState] = useState<SaveDraftActionState>({ status: "idle" });
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitActionState>({ status: "idle" });
  const [isSubmitting, startSubmitTransition] = useTransition();
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestAnswersRef = useRef<Record<string, AnswerValue>>(answers);

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
    if (!initialLoaded) return;

    const timer = autoSaveTimerRef;
    let cancelled = false;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      setSaveState({ status: "saving" });
      const result = await saveDraftAction(
        { status: "saving" },
        {
          surveyId,
          answers: latestAnswersRef.current as Record<string, unknown>,
        },
      );
      if (cancelled) return;
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
    <div className="space-y-4" dir="rtl">
      <h2 className="text-lg font-semibold">پاسخ به نظرسنجی</h2>

      {identityMode === "ANONYMOUS" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nobino پاسخ نهایی ناشناس را به حساب شما پیوند نمی‌دهد؛ با این حال
          ناشناسی در سطح برنامه است و متن پاسخ‌های آزاد ممکن است هویت شما را
          فاش کند.
        </div>
      ) : null}

      {/* Save state indicator */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {saveState.status === "saving" ? (
          <span className="text-muted-foreground">در حال ذخیره...</span>
        ) : saveState.status === "saved" ? (
          <span className="text-green-600">ذخیره شد</span>
        ) : saveState.status === "error" ? (
          <span className="text-destructive">{saveState.message ?? "خطا در ذخیره"}</span>
        ) : null}
        {identityMode === "ANONYMOUS" && initialLoaded ? (
          <span className="text-muted-foreground">
            پاسخ‌های پیش‌نویس هنوز ناشناس نیستند. ناشناس‌سازی پس از ثبت نهایی انجام می‌شود.
          </span>
        ) : null}
      </div>

      {questions.map((question, index) => {
        const isVisible = visibleQuestionIds.has(question.id);
        const showRequired = question.required && isVisible;

        return (
          <div
            key={question.id}
            className={`space-y-3 rounded-md border bg-card p-4 ${
              isVisible ? "" : "hidden"
            }`}
          >
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {index + 1}. {question.prompt}
                {showRequired ? (
                  <span className="text-destructive mr-1">*</span>
                ) : null}
              </p>
              {question.helpText ? (
                <p className="text-xs text-muted-foreground">{question.helpText}</p>
              ) : null}
            </div>

            {/* SHORT_TEXT */}
            {question.type === "SHORT_TEXT" ? (
              <input
                className="w-full rounded-md border border-input bg-background p-2 text-sm"
                maxLength={SURVEY_SHORT_TEXT_MAX_LENGTH}
                placeholder="پاسخ خود را وارد کنید..."
                value={typeof syncedAnswers[question.id] === "string" ? (syncedAnswers[question.id] as string) : ""}
                onChange={(e) => handleAnswer(question.id, e.target.value || null)}
              />
            ) : null}

            {/* LONG_TEXT */}
            {question.type === "LONG_TEXT" ? (
              <textarea
                className="min-h-[80px] w-full rounded-md border border-input bg-background p-3 text-sm"
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
                      className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-accent ${
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
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {question.ratingMinLabel ? (
                    <span className="text-xs text-muted-foreground">
                      {question.ratingMinLabel}
                    </span>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
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
                          className={`flex h-9 w-9 items-center justify-center rounded-md border text-sm transition-colors hover:bg-accent ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : ""
                          }`}
                          onClick={() => handleRating(question.id, val)}
                        >
                          {val}
                        </button>
                      );
                    })}
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
        );
      })}

      <section className="rounded-md border bg-card p-4" aria-live="polite">
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting || !initialLoaded}
                onClick={handleFinalSubmit}
              >
                {isSubmitting ? "در حال ثبت..." : "تأیید و ثبت نهایی"}
              </button>
              <button
                type="button"
                className="rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                onClick={() => setShowConfirmation(false)}
              >
                بازگشت و ویرایش
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">برای ثبت غیرقابل‌ویرایش پاسخ‌ها آماده‌اید؟</p>
            <button
              type="button"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!initialLoaded || isSubmitting}
              onClick={() => {
                setSubmitState({ status: "idle" });
                setShowConfirmation(true);
              }}
            >
              ثبت نهایی پاسخ‌ها
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
