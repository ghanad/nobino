"use client";

import type { ReactNode, Ref } from "react";

import { getDeterministicOptionOrder } from "@/lib/survey-service/option-order";
import {
  SURVEY_LONG_TEXT_MAX_LENGTH,
  SURVEY_SHORT_TEXT_MAX_LENGTH,
} from "@/lib/survey-response-limits";
import type { AnswerValue } from "@/lib/survey-response-utils";

export type QuestionViewOption = {
  id: string;
  label: string;
  sortOrder: number;
};

export type SurveyQuestionViewData = {
  id: string;
  prompt: string;
  helpText: string | null;
  type: string;
  required: boolean;
  randomizeOptions: boolean;
  ratingMin: number | null;
  ratingMax: number | null;
  ratingMinLabel: string | null;
  ratingMaxLabel: string | null;
  maxSelections: number | null;
  options: QuestionViewOption[];
};

type SurveyQuestionViewProps = {
  question: SurveyQuestionViewData;
  questionIndex: number;
  totalQuestions: number;
  value: AnswerValue | undefined;
  surveyId: string;
  userId: string;
  surveyKind: string;
  onChange: (questionId: string, value: AnswerValue) => void;
  promptRef?: Ref<HTMLParagraphElement>;
  headerStatus?: ReactNode;
  topNote?: ReactNode;
};

export function SurveyQuestionView({
  question,
  questionIndex,
  totalQuestions,
  value,
  surveyId,
  userId,
  surveyKind,
  onChange,
  promptRef,
  headerStatus,
  topNote,
}: SurveyQuestionViewProps) {
  const showRequired = question.required;
  const ratingMinLabel = question.ratingMinLabel ?? (
    surveyKind === "SATISFACTION" ? "خیلی ناراضی" : "کمترین امتیاز"
  );
  const ratingMaxLabel = question.ratingMaxLabel ?? (
    surveyKind === "SATISFACTION" ? "خیلی راضی" : "بیشترین امتیاز"
  );
  const selectedValues: string[] = Array.isArray(value) ? value : [];

  return (
    <div className="space-y-5 rounded-lg border bg-card p-4 sm:p-6">
      {topNote}
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p className="font-medium">
              سؤال {questionIndex + 1} از {totalQuestions}
            </p>
            {headerStatus}
          </div>
          <div
            aria-hidden="true"
            className="h-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
              style={{ width: `${((questionIndex + 1) / totalQuestions) * 100}%` }}
            />
          </div>
        </div>
        <p ref={promptRef} tabIndex={promptRef ? -1 : undefined} className="text-base font-semibold leading-7 text-slate-950">
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

      {question.type === "SHORT_TEXT" ? (
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          maxLength={SURVEY_SHORT_TEXT_MAX_LENGTH}
          placeholder="پاسخ خود را وارد کنید..."
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(question.id, event.target.value || null)}
        />
      ) : null}

      {question.type === "LONG_TEXT" ? (
        <textarea
          className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          maxLength={SURVEY_LONG_TEXT_MAX_LENGTH}
          placeholder="پاسخ خود را وارد کنید..."
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(question.id, event.target.value || null)}
        />
      ) : null}

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
              ? value === option.id
              : selectedValues.includes(option.id);
            const hasReachedSelectionLimit =
              question.type === "MULTIPLE_CHOICE" &&
              question.maxSelections !== null &&
              selectedValues.length >= question.maxSelections &&
              !isSelected;

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
                    onChange={() => onChange(question.id, option.id)}
                  />
                ) : (
                  <input
                    checked={isSelected}
                    className="h-4 w-4 cursor-pointer"
                    disabled={hasReachedSelectionLimit}
                    type="checkbox"
                    onChange={() => {
                      const next = isSelected
                        ? selectedValues.filter((v) => v !== option.id)
                        : [...selectedValues, option.id];
                      onChange(question.id, next.length > 0 ? next : null);
                    }}
                  />
                )}
                {option.label}
              </label>
            );
          })}
        </div>
      ) : null}

      {question.type === "RATING" ? (
        <div className="mx-auto max-w-full overflow-x-auto" role="group" aria-label={`امتیاز برای ${question.prompt}`}>
          <div className="grid min-w-[17.75rem] w-max grid-cols-2 gap-x-3 text-xs leading-5 text-muted-foreground">
            <span className="min-w-0 text-right">{ratingMinLabel}</span>
            <span className="min-w-0 text-left">{ratingMaxLabel}</span>
            <div className="col-span-2 mt-1 flex gap-2" aria-label="مقیاس امتیازدهی">
              {Array.from(
                {
                  length: (question.ratingMax ?? 5) - (question.ratingMin ?? 1) + 1,
                },
                (_, i) => (question.ratingMin ?? 1) + i,
              ).map((val) => {
                const isSelected = value === val;
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
                    onClick={() => onChange(question.id, isSelected ? null : val)}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
