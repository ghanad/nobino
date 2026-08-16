"use client";

import { useState } from "react";

import { Plus, Trash2 } from "lucide-react";
import type { SurveyQuestionType } from "@prisma/client";

import { FieldLabel } from "@/app/admin/_components/admin-form-fields";
import {
  addQuestionAction,
  deleteQuestionAction,
  updateQuestionAction,
  type SurveyQuestionData,
} from "@/app/surveys/survey-question-actions";
import { Button } from "@/components/ui/button";

const QUESTION_TYPE_OPTIONS: {
  value: SurveyQuestionType;
  label: string;
}[] = [
  { value: "SHORT_TEXT", label: "پاسخ کوتاه" },
  { value: "LONG_TEXT", label: "پاسخ بلند" },
  { value: "SINGLE_CHOICE", label: "تک‌گزینه‌ای" },
  { value: "MULTIPLE_CHOICE", label: "چندگزینه‌ای" },
  { value: "RATING", label: "امتیازدهی" },
];

const QUESTION_TYPE_LABELS = new Map(
  QUESTION_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

const persianNumber = new Intl.NumberFormat("fa-IR");

function isChoiceType(type: SurveyQuestionType): boolean {
  return type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE";
}

type SurveyQuestionBuilderProps = {
  surveyId: string;
  canEdit: boolean;
  questions: SurveyQuestionData[];
};

export function SurveyQuestionBuilder({
  surveyId,
  canEdit,
  questions: initialQuestions,
}: SurveyQuestionBuilderProps) {
  const [questions, setQuestions] =
    useState<SurveyQuestionData[]>(initialQuestions);

  function handleAdded(question: SurveyQuestionData) {
    setQuestions((prev) => [...prev, question]);
  }

  function handleUpdated(question: SurveyQuestionData) {
    setQuestions((prev) =>
      prev.map((item) => (item.id === question.id ? question : item)),
    );
  }

  function handleDeleted(questionId: string) {
    setQuestions((prev) => prev.filter((item) => item.id !== questionId));
  }

  return (
    <section className="grid gap-4 rounded-lg border p-4" dir="rtl">
      <div className="grid gap-1">
        <h2 className="text-sm font-medium">سوالات نظرسنجی</h2>
        <p className="text-xs text-muted-foreground">
          سوالات با انواع پاسخ کوتاه، پاسخ بلند، تک‌گزینه‌ای، چندگزینه‌ای و
          امتیازدهی طراحی می‌شوند.
        </p>
      </div>

      {!canEdit ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          این نظرسنجی دیگر در حالت پیش‌نویس نیست و سوالات آن قابل ویرایش
          نمی‌باشند.
        </div>
      ) : null}

      {questions.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
          هنوز هیچ سوالی اضافه نشده است.
        </p>
      ) : (
        <ol className="grid gap-4">
          {questions.map((question, index) => (
            <li key={question.id}>
              <SurveyQuestionCard
                canEdit={canEdit}
                index={index}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
                question={question}
                surveyId={surveyId}
              />
            </li>
          ))}
        </ol>
      )}

      {canEdit ? (
        <AddQuestionForm onAdded={handleAdded} surveyId={surveyId} />
      ) : null}
    </section>
  );
}

type AddQuestionFormProps = {
  surveyId: string;
  onAdded: (question: SurveyQuestionData) => void;
};

function AddQuestionForm({ surveyId, onAdded }: AddQuestionFormProps) {
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<SurveyQuestionType>("SHORT_TEXT");
  const [required, setRequired] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setPromptError(null);

    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("prompt", prompt);
    form.set("type", type);
    if (required) {
      form.set("required", "on");
    }

    try {
      const result = await addQuestionAction({}, form);
      if (result.status === "success" && result.question) {
        onAdded(result.question);
        setPrompt("");
        setRequired(false);
      } else {
        setMessage(result.message ?? "افزودن سوال ناموفق بود.");
        setPromptError(result.errors?.prompt?.[0] ?? null);
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-dashed p-4"
      onSubmit={handleSubmit}
    >
      <h3 className="text-xs font-medium">افزودن سوال جدید</h3>

      {message ? (
        <p className="text-xs text-destructive">{message}</p>
      ) : null}

      <div className="grid gap-2">
        <FieldLabel htmlFor="new-question-prompt">متن سوال</FieldLabel>
        <input
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          id="new-question-prompt"
          maxLength={2000}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="متن سوال را وارد کنید"
          type="text"
          value={prompt}
        />
        {promptError ? (
          <p className="text-xs text-red-600">{promptError}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel htmlFor="new-question-type">نوع سوال</FieldLabel>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            id="new-question-type"
            onChange={(event) => setType(event.target.value as SurveyQuestionType)}
            value={type}
          >
            {QUESTION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 self-end text-sm">
          <input
            checked={required}
            className="h-4 w-4"
            onChange={(event) => setRequired(event.target.checked)}
            type="checkbox"
          />
          پاسخ به این سوال الزامی است
        </label>
      </div>

      <div className="flex justify-start">
        <Button disabled={pending} type="submit">
          <Plus className="h-4 w-4" />
          افزودن سوال
        </Button>
      </div>
    </form>
  );
}

type SurveyQuestionCardProps = {
  surveyId: string;
  question: SurveyQuestionData;
  index: number;
  canEdit: boolean;
  onUpdated: (question: SurveyQuestionData) => void;
  onDeleted: (questionId: string) => void;
};

function SurveyQuestionCard({
  surveyId,
  question,
  index,
  canEdit,
  onUpdated,
  onDeleted,
}: SurveyQuestionCardProps) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [helpText, setHelpText] = useState(question.helpText ?? "");
  const [type, setType] = useState<SurveyQuestionType>(question.type);
  const [required, setRequired] = useState(question.required);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  const typeChanged = type !== question.type;
  const droppingOptions = typeChanged && isChoiceType(question.type) && !isChoiceType(type);

  if (!canEdit) {
    return (
      <div className="grid gap-2 rounded-lg border bg-muted/30 p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">
            سوال {persianNumber.format(index + 1)}
          </span>
          <span className="text-xs text-muted-foreground">
            {QUESTION_TYPE_LABELS.get(question.type)}
          </span>
        </div>
        <p>{question.prompt}</p>
        {question.helpText ? (
          <p className="text-xs text-muted-foreground">{question.helpText}</p>
        ) : null}
        {question.required ? (
          <p className="text-xs text-muted-foreground">الزامی</p>
        ) : null}
      </div>
    );
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setPromptError(null);

    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("questionId", question.id);
    form.set("prompt", prompt);
    form.set("helpText", helpText);
    form.set("type", type);
    if (required) {
      form.set("required", "on");
    }

    try {
      const result = await updateQuestionAction({}, form);
      if (result.status === "success" && result.question) {
        onUpdated(result.question);
        setMessage("ذخیره شد");
      } else {
        setMessage(result.message ?? "ذخیره سوال ناموفق بود.");
        setPromptError(result.errors?.prompt?.[0] ?? null);
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setMessage(null);

    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("questionId", question.id);

    try {
      const result = await deleteQuestionAction({}, form);
      if (result.status === "success") {
        onDeleted(question.id);
      } else {
        setMessage(result.message ?? "حذف سوال ناموفق بود.");
        setConfirmingDelete(false);
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          سوال {persianNumber.format(index + 1)}
        </span>
        <span className="text-xs text-muted-foreground">
          {QUESTION_TYPE_LABELS.get(type)}
        </span>
      </div>

      {message ? (
        <p
          className={`text-xs ${message === "ذخیره شد" ? "text-green-600" : "text-destructive"}`}
        >
          {message}
        </p>
      ) : null}

      <form className="grid gap-3" onSubmit={handleSave}>
        <div className="grid gap-2">
          <FieldLabel htmlFor={`question-prompt-${question.id}`}>
            متن سوال
          </FieldLabel>
          <input
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            id={`question-prompt-${question.id}`}
            maxLength={2000}
            onChange={(event) => setPrompt(event.target.value)}
            type="text"
            value={prompt}
          />
          {promptError ? (
            <p className="text-xs text-red-600">{promptError}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <FieldLabel htmlFor={`question-help-${question.id}`}>
            متن راهنما (اختیاری)
          </FieldLabel>
          <input
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            id={`question-help-${question.id}`}
            maxLength={1000}
            onChange={(event) => setHelpText(event.target.value)}
            placeholder="توضیح کوتاه برای این سوال"
            type="text"
            value={helpText}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <FieldLabel htmlFor={`question-type-${question.id}`}>
              نوع سوال
            </FieldLabel>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              id={`question-type-${question.id}`}
              onChange={(event) =>
                setType(event.target.value as SurveyQuestionType)
              }
              value={type}
            >
              {QUESTION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {droppingOptions ? (
              <p className="text-xs text-amber-700">
                با تغییر نوع، گزینه‌ها و شرط‌های وابسته این سوال حذف می‌شوند.
              </p>
            ) : null}
          </div>

          <label className="flex items-center gap-2 self-end text-sm">
            <input
              checked={required}
              className="h-4 w-4"
              onChange={(event) => setRequired(event.target.checked)}
              type="checkbox"
            />
            پاسخ به این سوال الزامی است
          </label>
        </div>

        <div className="flex items-center gap-2 border-t pt-3">
          <Button disabled={saving} size="sm" type="submit">
            ذخیره
          </Button>

          {confirmingDelete ? (
            <span className="flex items-center gap-2 text-xs">
              <span>حذف شود؟</span>
              <Button
                disabled={deleting}
                onClick={handleDelete}
                size="sm"
                type="button"
                variant="destructive"
              >
                تأیید حذف
              </Button>
              <Button
                disabled={deleting}
                onClick={() => setConfirmingDelete(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                انصراف
              </Button>
            </span>
          ) : (
            <Button
              onClick={() => setConfirmingDelete(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
