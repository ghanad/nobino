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
import {
  SurveyQuestionView,
  type SurveyQuestionViewData,
} from "@/components/surveys/survey-question-view";

const PREVIEW_USER_ID = "preview";

type PreviewCondition = {
  sourceQuestionId: string;
  sourceQuestionPrompt: string;
  sourceOptionId: string;
  sourceOptionLabel: string;
  operator: "IS_SELECTED" | "IS_NOT_SELECTED";
};

type PreviewQuestion = SurveyQuestionViewData & {
  type: SurveyQuestionType;
  sortOrder: number;
  condition: PreviewCondition | null;
};

type SurveyPreviewProps = {
  surveyId: string;
  surveyKind: string;
  title: string;
  description: string | null;
  questions: PreviewQuestion[];
  identityMode: string;
  isAnonymous: boolean;
};

export function SurveyPreview({
  surveyId,
  surveyKind,
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
  const currentQuestionIndex = Math.min(
    currentStep,
    Math.max(visibleQuestions.length - 1, 0),
  );
  const currentQuestion = visibleQuestions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === visibleQuestions.length - 1;

  useEffect(() => {
    setCurrentStep((step) =>
      Math.min(step, Math.max(visibleQuestions.length - 1, 0)),
    );
  }, [visibleQuestions.length]);

  const updateAnswer = (questionId: string, value: AnswerValue) => {
    setPreviewComplete(false);
    setStepError(null);
    setAnswers((currentAnswers) => {
      const nextAnswers = { ...currentAnswers, [questionId]: value };
      return clearHiddenAnswers(visibilityQuestions, nextAnswers);
    });
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
          <SurveyQuestionView
            key={question.id}
            question={question}
            questionIndex={currentQuestionIndex}
            totalQuestions={visibleQuestions.length}
            value={answers[question.id]}
            surveyId={surveyId}
            userId={PREVIEW_USER_ID}
            surveyKind={surveyKind}
            onChange={updateAnswer}
            topNote={
              question.condition ? (
                <p className="text-xs text-muted-foreground">
                  (تنها در صورتی نمایش داده می‌شود که در سوال &ldquo;
                  {question.condition.sourceQuestionPrompt}
                  &rdquo; گزینه &ldquo;
                  {question.condition.sourceOptionLabel}
                  &rdquo; را انتخاب کرده باشید)
                </p>
              ) : null
            }
          />
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
              disabled={currentQuestionIndex === 0}
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
