"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { loadDraftAction, saveDraftAction, type SaveDraftActionState } from "@/app/surveys/survey-draft-actions";
import {
  submitAnonymousResponseAction,
  submitResponseAction,
  type SubmitActionState,
} from "@/app/surveys/survey-submit-actions";
import { getVisibleQuestionIds, clearHiddenAnswers, type AnswerValue, type QuestionWithCondition } from "@/lib/survey-response-utils";
import { SurveyQuestionView, type SurveyQuestionViewData } from "@/components/surveys/survey-question-view";

type ResponseQuestion = SurveyQuestionViewData & {
  condition: { sourceQuestionId: string; sourceOptionId: string; operator: string } | null;
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
  const currentQuestionId = currentQuestion?.id;
  const currentQuestionIndex = currentQuestion
    ? visibleQuestions.findIndex((question) => question.id === currentQuestion.id)
    : -1;
  const isLastQuestion = currentQuestionIndex === visibleQuestions.length - 1;

  useEffect(() => {
    setCurrentStep((step) => Math.min(step, Math.max(visibleQuestions.length - 1, 0)));
  }, [visibleQuestions.length]);

  useEffect(() => {
    if (initialLoaded && currentQuestionId) {
      questionHeadingRef.current?.focus();
    }
  }, [currentQuestionId, initialLoaded]);

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
      setSubmitState({ status: "idle" });
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
    });
  }, [identityMode, isSubmitting, surveyId, visibilityQuestions]);

  const goToNextQuestion = useCallback(() => {
    if (!currentQuestion) return;

    if (currentQuestion.required && !hasAnswer(syncedAnswers[currentQuestion.id])) {
      setStepError("پاسخ به این سؤال الزامی است.");
      return;
    }

    setStepError(null);
    if (isLastQuestion) {
      setSubmitState({ status: "idle" });
      handleFinalSubmit();
      return;
    }
    setCurrentStep((step) => Math.min(step + 1, visibleQuestions.length - 1));
  }, [currentQuestion, handleFinalSubmit, isLastQuestion, syncedAnswers, visibleQuestions.length]);

  const goToPreviousQuestion = useCallback(() => {
    setStepError(null);
    setCurrentStep((step) => Math.max(step - 1, 0));
  }, []);

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

        return (
          <div key={question.id} className={isVisible ? "" : "hidden"}>
            <SurveyQuestionView
              question={question}
              questionIndex={currentQuestionIndex}
              totalQuestions={visibleQuestions.length}
              value={syncedAnswers[question.id]}
              surveyId={surveyId}
              userId={userId}
              surveyKind={surveyKind}
              onChange={handleAnswer}
              promptRef={questionHeadingRef}
              headerStatus={
                saveState.status !== "idle" ? (
                  <p
                    aria-live="polite"
                    className={saveState.status === "error" ? "text-destructive" : undefined}
                    role="status"
                  >
                    {saveState.status === "saving" ? "در حال ذخیره…" : null}
                    {saveState.status === "saved" ? "ذخیره شد" : null}
                    {saveState.status === "error" ? saveState.message ?? "خطا در ذخیره" : null}
                  </p>
                ) : null
              }
            />
          </div>
        );
      }) : null}

      {currentQuestion ? (
        <section className="space-y-3 border-t pt-4" aria-label="پیمایش سؤال‌ها">
          {stepError ? (
            <p className="text-sm text-destructive" role="alert">{stepError}</p>
          ) : null}
          {submitState.status === "error" || submitState.status === "conflict" ? (
            <p className="text-sm text-destructive" role="alert">{submitState.message}</p>
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
              {isLastQuestion ? (isSubmitting ? "در حال ثبت..." : "ثبت نهایی پاسخ‌ها") : "سؤال بعدی"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function hasAnswer(answer: AnswerValue | undefined): boolean {
  if (typeof answer === "string") return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return typeof answer === "number";
}
