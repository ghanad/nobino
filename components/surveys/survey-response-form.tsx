"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadDraftAction, saveDraftAction, type SaveDraftActionState } from "@/app/surveys/survey-draft-actions";
import { getDeterministicOptionOrder } from "@/lib/survey-service/option-order";
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
    loadDraftAction(surveyId).then(({ answers: draftAnswers }) => {
      if (cancelled) return;
      if (draftAnswers) {
        setAnswers(draftAnswers as Record<string, AnswerValue>);
      }
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

  return (
    <div className="space-y-4" dir="rtl">
      <h2 className="text-lg font-semibold">پاسخ به نظرسنجی</h2>

      {identityMode === "ANONYMOUS" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          پاسخ‌ها به صورت ناشناس ثبت می‌شوند. پاسخ شما قابل ردیابی نیست.
          متن پاسخ‌های آزاد ممکن است هویت شما را فاش کنند.
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
                placeholder="پاسخ خود را وارد کنید..."
                value={typeof syncedAnswers[question.id] === "string" ? (syncedAnswers[question.id] as string) : ""}
                onChange={(e) => handleAnswer(question.id, e.target.value || null)}
              />
            ) : null}

            {/* LONG_TEXT */}
            {question.type === "LONG_TEXT" ? (
              <textarea
                className="min-h-[80px] w-full rounded-md border border-input bg-background p-3 text-sm"
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
    </div>
  );
}
