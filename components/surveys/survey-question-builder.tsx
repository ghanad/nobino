"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArrowDown, ArrowUp, ChevronDown, GitBranch, Plus, Shuffle, Trash2 } from "lucide-react";
import type { SurveyConditionOperator, SurveyQuestionType } from "@prisma/client";

import { FieldLabel } from "@/app/admin/_components/admin-form-fields";
import {
  addQuestionAction,
  deleteQuestionAction,
  updateQuestionAction,
  type SurveyQuestionData,
  getSurveyQuestionsAction,
} from "@/app/surveys/survey-question-actions";
import {
  addOptionAction,
  deleteOptionAction,
  updateOptionAction,
  reorderOptionsAction,
  reorderQuestionsAction,
  type OptionData,
} from "@/app/surveys/survey-option-actions";
import {
  removeQuestionConditionAction,
  setQuestionConditionAction,
  updateQuestionRandomizeAction,
  type QuestionConditionData,
  type RandomizeActionState,
} from "@/app/surveys/survey-branching-actions";
import { Button } from "@/components/ui/button";
import {
  SurveyAiPanel,
  SurveyAiQuestionReview,
  SurveyAiQuestionReviewTrigger,
} from "@/components/surveys/survey-ai-panel";

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

type QuestionWithOptions = SurveyQuestionData & {
  options: { id: string; label: string; sortOrder: number }[];
  targetCondition: QuestionConditionData | null;
};

type EditableQuestionFields = {
  prompt: string;
  helpText: string;
  type: SurveyQuestionType;
  required: boolean;
  ratingMin: string;
  ratingMax: string;
  ratingMinLabel: string;
  ratingMaxLabel: string;
  maxSelections: string;
};

function editableFieldsFromQuestion(question: Pick<SurveyQuestionData, "prompt" | "helpText" | "type" | "required" | "ratingMin" | "ratingMax" | "ratingMinLabel" | "ratingMaxLabel" | "maxSelections">): EditableQuestionFields {
  return {
    prompt: question.prompt,
    helpText: question.helpText ?? "",
    type: question.type,
    required: question.required,
    ratingMin: question.ratingMin?.toString() ?? "1",
    ratingMax: question.ratingMax?.toString() ?? "5",
    ratingMinLabel: question.ratingMinLabel ?? "",
    ratingMaxLabel: question.ratingMaxLabel ?? "",
    maxSelections: question.maxSelections?.toString() ?? "",
  };
}

type SurveyQuestionBuilderProps = {
  surveyId: string;
  canEdit: boolean;
  questions: QuestionWithOptions[];
};

export function SurveyQuestionBuilder({
  surveyId,
  canEdit,
  questions: initialQuestions,
}: SurveyQuestionBuilderProps) {
  const [questions, setQuestions] =
    useState<QuestionWithOptions[]>(initialQuestions);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(
    initialQuestions[0]?.id ?? null,
  );

  // Scroll to active question when it changes (e.g. after AI adds questions)
  useEffect(() => {
    if (!activeQuestionId) return;
    // Small delay to let the DOM update after state change
    const timer = setTimeout(() => {
      document.getElementById(`question-${activeQuestionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, [activeQuestionId]);

  function handleAdded(question: SurveyQuestionData) {
    setQuestions((prev) => [
      ...prev,
      { ...question, options: [], targetCondition: null },
    ]);
    setActiveQuestionId(question.id);
  }

  function handleUpdated(question: SurveyQuestionData) {
    setQuestions((prev) =>
      prev.map((item) => {
        if (item.id !== question.id) return item;
        return {
          ...item,
          ...question,
          options: item.options,
          targetCondition: item.targetCondition,
        };
      }),
    );
  }

  function handleConditionUpdated(
    questionId: string,
    condition: QuestionConditionData | null,
  ) {
    setQuestions((prev) =>
      prev.map((item) =>
        item.id === questionId
          ? { ...item, targetCondition: condition }
          : item,
      ),
    );
  }

  function handleDeleted(questionId: string) {
    setQuestions((prev) => prev.filter((item) => item.id !== questionId));
    setActiveQuestionId((current) => (current === questionId ? null : current));
  }

  const handleAiApplied = useCallback(async () => {
    try {
      const fresh = await getSurveyQuestionsAction(surveyId);
      setQuestions(fresh);
      setActiveQuestionId(fresh[fresh.length - 1]?.id ?? null);
    } catch {
      // Refetch failed; user can still manually refresh the page.
    }
  }, [surveyId]);

  function handleRandomizeToggle(
    questionId: string,
    enabled: boolean,
  ) {
    setQuestions((prev) =>
      prev.map((item) =>
        item.id === questionId
          ? { ...item, randomizeOptions: enabled }
          : item,
      ),
    );

    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("questionId", questionId);
    form.set("randomizeOptions", String(enabled));

    updateQuestionRandomizeAction({ message: undefined, status: "idle" }, form).then((result: RandomizeActionState) => {
      if (result.status === "error") {
        setQuestions((prev) =>
          prev.map((item) =>
            item.id === questionId
              ? { ...item, randomizeOptions: !enabled }
              : item,
          ),
        );
      }
    });
  }

  function handleOptionAdded(questionId: string, option: OptionData) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, options: [...q.options, option] }
          : q,
      ),
    );
  }

  function handleOptionUpdated(questionId: string, option: OptionData) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map((o) =>
                o.id === option.id ? option : o,
              ),
            }
          : q,
      ),
    );
  }

  function handleOptionDeleted(questionId: string, optionId: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.filter((o) => o.id !== optionId) }
          : q,
      ),
    );
  }

  async function handleMoveQuestionUp(index: number) {
    if (index === 0) return;
    const newOrder = [...questions];
    const temp = newOrder[index - 1];
    newOrder[index - 1] = newOrder[index];
    newOrder[index] = temp;
    setQuestions(newOrder);

    const result = await reorderQuestionsAction(
      newOrder.map((q) => q.id),
      surveyId,
    );
    if (result.status === "error") {
      setQuestions(questions);
    }
  }

  async function handleMoveQuestionDown(index: number) {
    if (index === questions.length - 1) return;
    const newOrder = [...questions];
    const temp = newOrder[index + 1];
    newOrder[index + 1] = newOrder[index];
    newOrder[index] = temp;
    setQuestions(newOrder);

    const result = await reorderQuestionsAction(
      newOrder.map((q) => q.id),
      surveyId,
    );
    if (result.status === "error") {
      setQuestions(questions);
    }
  }

  // Publish-blocking validation
  const validationMessages: string[] = [];
  for (const question of questions) {
    if (isChoiceType(question.type)) {
      const labels = question.options.map((o) => o.label.trim());
      const uniqueLabels = new Set(labels);
      if (labels.length < 2) {
        validationMessages.push(
          `سوال ${persianNumber.format(questions.indexOf(question) + 1)} («${question.prompt}»): حداقل دو گزینه لازم است.`,
        );
      } else if (uniqueLabels.size !== labels.length) {
        validationMessages.push(
          `سوال ${persianNumber.format(questions.indexOf(question) + 1)} («${question.prompt}»): گزینه‌های تکراری وجود دارد.`,
        );
      } else if (labels.some((l) => l.length === 0)) {
        validationMessages.push(
          `سوال ${persianNumber.format(questions.indexOf(question) + 1)} («${question.prompt}»): گزینه‌های خالی وجود دارد.`,
        );
      }
      if (
        question.type === "MULTIPLE_CHOICE" &&
        question.maxSelections !== null &&
        question.maxSelections > labels.length
      ) {
        validationMessages.push(
          `سوال ${persianNumber.format(questions.indexOf(question) + 1)} («${question.prompt}»): حداکثر تعداد انتخاب نمی‌تواند از تعداد گزینه‌ها بیشتر باشد.`,
        );
      }
    }
    if (question.type === "RATING") {
      if (
        question.ratingMin === null ||
        question.ratingMax === null
      ) {
        validationMessages.push(
          `سوال ${persianNumber.format(questions.indexOf(question) + 1)} («${question.prompt}»): بازه امتیازدهی باید مشخص شود.`,
        );
      }
    }
  }

  return (
    <section className="grid gap-5" dir="rtl">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">سوالات نظرسنجی</h2>
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

      <SurveyAiPanel surveyId={surveyId} disabled={!canEdit} onApplied={handleAiApplied} />

      {questions.length > 0 && validationMessages.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <p className="mb-2 text-sm font-medium text-red-800">
            برای انتشار باید مشکلات زیر برطرف شود:
          </p>
          <ul className="grid gap-1">
            {validationMessages.map((msg, i) => (
              <li key={i} className="text-xs text-red-700">
                {msg}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {questions.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
          هنوز هیچ سوالی اضافه نشده است.
        </p>
      ) : (
        <ol className="grid gap-3">
          {questions.map((question, index) => (
            <li id={`question-${question.id}`} key={question.id}>
              <SurveyQuestionCard
                canEdit={canEdit}
                index={index}
                isActive={activeQuestionId === question.id}
                isFirst={index === 0}
                isLast={index === questions.length - 1}
                onDeleted={handleDeleted}
                onMoveDown={() => handleMoveQuestionDown(index)}
                onMoveUp={() => handleMoveQuestionUp(index)}
                onOptionAdded={(option) =>
                  handleOptionAdded(question.id, option)
                }
                onOptionDeleted={(optionId) =>
                  handleOptionDeleted(question.id, optionId)
                }
                onOptionUpdated={(option) =>
                  handleOptionUpdated(question.id, option)
                }
                onUpdated={handleUpdated}
                onSelect={() => setActiveQuestionId(question.id)}
                onRandomizeToggle={handleRandomizeToggle}
                onConditionUpdated={(condition) =>
                  handleConditionUpdated(question.id, condition)
                }
                questions={questions}
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
  const [isAdding, setIsAdding] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<SurveyQuestionType>("SHORT_TEXT");
  const [required, setRequired] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding) promptInputRef.current?.focus();
  }, [isAdding]);

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
        setIsAdding(false);
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

  if (!isAdding) {
    return (
      <div className="border-t border-dashed pt-5">
        <Button onClick={() => setIsAdding(true)} size="sm" type="button" variant="outline">
          <Plus className="h-3.5 w-3.5" />
          افزودن سؤال
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-3 border-t border-dashed pt-5"
      onSubmit={handleSubmit}
    >
      <h3 className="text-sm font-medium">افزودن سوال جدید</h3>

      {message ? (
        <p className="text-xs text-destructive">{message}</p>
      ) : null}

      <div className="grid gap-2">
        <FieldLabel htmlFor="add-question-prompt">متن سوال</FieldLabel>
        <input
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          id="add-question-prompt"
          ref={promptInputRef}
          maxLength={2000}
          onChange={(event) => setPrompt(event.target.value)}
          required
          type="text"
          value={prompt}
        />
        {promptError ? (
          <p className="text-xs text-red-600">{promptError}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <FieldLabel htmlFor="add-question-type">نوع سوال</FieldLabel>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            id="add-question-type"
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

      <div className="flex items-center gap-2">
      <Button disabled={pending} size="sm" type="submit">
        <Plus className="h-3.5 w-3.5" />
        افزودن
      </Button>
      <Button disabled={pending} onClick={() => setIsAdding(false)} size="sm" type="button" variant="ghost">
        انصراف
      </Button>
      </div>
    </form>
  );
}

type SurveyQuestionCardProps = {
  canEdit: boolean;
  questions: QuestionWithOptions[];
  index: number;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
  onDeleted: (questionId: string) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onOptionAdded: (option: OptionData) => void;
  onOptionDeleted: (optionId: string) => void;
  onOptionUpdated: (option: OptionData) => void;
  onConditionUpdated: (condition: QuestionConditionData | null) => void;
  onUpdated: (question: SurveyQuestionData) => void;
  onSelect: () => void;
  onRandomizeToggle: (questionId: string, enabled: boolean) => void;
  question: QuestionWithOptions;
  surveyId: string;
};

function SurveyQuestionCard({
  canEdit,
  questions,
  index,
  isActive,
  isFirst,
  isLast,
  onDeleted,
  onMoveDown,
  onMoveUp,
  onOptionAdded,
  onOptionDeleted,
  onOptionUpdated,
  onConditionUpdated,
  onUpdated,
  onSelect,
  onRandomizeToggle,
  question,
  surveyId,
}: SurveyQuestionCardProps) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [helpText, setHelpText] = useState(question.helpText ?? "");
  const [type, setType] = useState(question.type);
  const [required, setRequired] = useState(question.required);
  const [ratingMin, setRatingMin] = useState(
    question.ratingMin?.toString() ?? "1",
  );
  const [ratingMax, setRatingMax] = useState(
    question.ratingMax?.toString() ?? "5",
  );
  const [ratingMinLabel, setRatingMinLabel] = useState(
    question.ratingMinLabel ?? "",
  );
  const [ratingMaxLabel, setRatingMaxLabel] = useState(
    question.ratingMaxLabel ?? "",
  );
  const [maxSelections, setMaxSelections] = useState(
    question.maxSelections?.toString() ?? "",
  );
  const [savedFields, setSavedFields] = useState<EditableQuestionFields>(() => editableFieldsFromQuestion(question));
  const [dirtyOptionIds, setDirtyOptionIds] = useState<Set<string>>(() => new Set());
  const [aiReviewOpen, setAiReviewOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  const droppingOptions =
    isChoiceType(question.type) && !isChoiceType(type);
  const currentFields: EditableQuestionFields = {
    prompt,
    helpText,
    type,
    required,
    ratingMin,
    ratingMax,
    ratingMinLabel,
    ratingMaxLabel,
    maxSelections,
  };
  const isDirty = JSON.stringify(currentFields) !== JSON.stringify(savedFields) || dirtyOptionIds.size > 0;
  const questionRevision = question.options.map((option) => `${option.id}:${option.label}`).join("|");
  const closeAiReview = useCallback(() => setAiReviewOpen(false), []);

  useEffect(() => {
    if (isDirty) setAiReviewOpen(false);
  }, [isDirty]);

  async function handleSave() {
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
    if (type === "RATING") {
      form.set("ratingMin", ratingMin);
      form.set("ratingMax", ratingMax);
      form.set("ratingMinLabel", ratingMinLabel);
      form.set("ratingMaxLabel", ratingMaxLabel);
    }
    if (type === "MULTIPLE_CHOICE" && maxSelections) {
      form.set("maxSelections", maxSelections);
    }

    try {
      const result = await updateQuestionAction({}, form);
      if (result.status === "success" && result.question) {
        onUpdated(result.question);
        const nextFields = editableFieldsFromQuestion(result.question);
        setPrompt(nextFields.prompt);
        setHelpText(nextFields.helpText);
        setType(nextFields.type);
        setRequired(nextFields.required);
        setRatingMin(nextFields.ratingMin);
        setRatingMax(nextFields.ratingMax);
        setRatingMinLabel(nextFields.ratingMinLabel);
        setRatingMaxLabel(nextFields.ratingMaxLabel);
        setMaxSelections(nextFields.maxSelections);
        setSavedFields(nextFields);
        setMessage("تغییرات این سؤال اعمال شد.");
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

  function handleOptionDirtyChange(optionId: string, dirty: boolean) {
    setDirtyOptionIds((current) => {
      const next = new Set(current);
      if (dirty) next.add(optionId);
      else next.delete(optionId);
      return next;
    });
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
    <div className={`grid rounded-lg border transition-colors ${isActive ? "gap-3 border-border bg-primary/[0.025]" : "gap-0 bg-background"}`}>
      <div className="flex items-center justify-between gap-3">
      <button
        aria-expanded={isActive}
        className="flex min-w-0 flex-1 items-center p-4 text-right hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
        type="button"
      >
        <div className="grid gap-0.5">
          <span className="text-sm font-semibold">
            سوال {persianNumber.format(index + 1)}
          </span>
          <span className="text-xs text-muted-foreground">
            {QUESTION_TYPE_LABELS.get(type)} · {required ? "الزامی" : "اختیاری"}
          </span>
        </div>
      </button>
        <div className="flex shrink-0 items-center gap-1 pl-2">
          {canEdit ? (
            <SurveyAiQuestionReviewTrigger
              disabled={isDirty}
              onToggle={() => setAiReviewOpen((current) => !current)}
              open={aiReviewOpen}
              questionId={question.id}
            />
          ) : null}
          {canEdit ? (
            <div className="flex items-center gap-1">
            <Button
              disabled={isFirst}
              onClick={onMoveUp}
              size="sm"
              type="button"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label="انتقال به بالا"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              disabled={isLast}
              onClick={onMoveDown}
              size="sm"
              type="button"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label="انتقال به پایین"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            </div>
          ) : null}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isActive ? "rotate-180" : ""}`} />
        </div>
      </div>

      <SurveyAiQuestionReview
        disabled={isDirty}
        onClose={closeAiReview}
        open={aiReviewOpen}
        questionId={question.id}
        revision={questionRevision}
        surveyId={surveyId}
      />

      {!isActive ? <p className="truncate px-4 pb-4 text-sm text-muted-foreground">{prompt || "بدون متن سوال"}</p> : null}

      {isActive && isDirty ? <p className="px-4 text-xs text-amber-800">ابتدا تغییرات سؤال را ذخیره کنید تا بررسی نسخهٔ فعلی ممکن شود.</p> : null}

      {isActive && message ? (
        <p
          className={`px-4 text-xs ${message === "تغییرات این سؤال اعمال شد." ? "text-green-700" : "text-destructive"}`}
        >
          {message}
        </p>
      ) : null}

      {isActive ? <div className="grid gap-3 px-4 pb-4">
        <div className="grid gap-1.5">
          <FieldLabel htmlFor={`question-prompt-${question.id}`}>
            متن سوال
          </FieldLabel>
          <input
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            disabled={!canEdit}
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

        <div className="grid gap-1.5">
          <FieldLabel htmlFor={`question-help-${question.id}`}>
            متن راهنما (اختیاری)
          </FieldLabel>
          <input
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            disabled={!canEdit}
            id={`question-help-${question.id}`}
            maxLength={1000}
            onChange={(event) => setHelpText(event.target.value)}
            placeholder="توضیح کوتاه برای این سوال"
            type="text"
            value={helpText}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <FieldLabel htmlFor={`question-type-${question.id}`}>
              نوع سوال
            </FieldLabel>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!canEdit}
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
              disabled={!canEdit}
              onChange={(event) => setRequired(event.target.checked)}
              type="checkbox"
            />
            پاسخ به این سوال الزامی است
          </label>
        </div>

        {/* Rating configuration */}
        {type === "RATING" ? (
          <div className="grid gap-2.5 bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              تنظیمات امتیازدهی
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="grid gap-1.5">
                <FieldLabel htmlFor={`rating-min-${question.id}`}>
                  حداقل امتیاز
                </FieldLabel>
                <input
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={!canEdit}
                  id={`rating-min-${question.id}`}
                  max={10}
                  min={0}
                  onChange={(event) => setRatingMin(event.target.value)}
                  type="number"
                  value={ratingMin}
                />
              </div>
              <div className="grid gap-1.5">
                <FieldLabel htmlFor={`rating-max-${question.id}`}>
                  حداکثر امتیاز
                </FieldLabel>
                <input
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={!canEdit}
                  id={`rating-max-${question.id}`}
                  max={10}
                  min={0}
                  onChange={(event) => setRatingMax(event.target.value)}
                  type="number"
                  value={ratingMax}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="grid gap-1.5">
                <FieldLabel htmlFor={`rating-min-label-${question.id}`}>
                  برچسب حداقل (اختیاری)
                </FieldLabel>
                <input
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={!canEdit}
                  id={`rating-min-label-${question.id}`}
                  maxLength={200}
                  onChange={(event) =>
                    setRatingMinLabel(event.target.value)
                  }
                  placeholder="مثلاً: خیلی بد"
                  type="text"
                  value={ratingMinLabel}
                />
              </div>
              <div className="grid gap-1.5">
                <FieldLabel htmlFor={`rating-max-label-${question.id}`}>
                  برچسب حداکثر (اختیاری)
                </FieldLabel>
                <input
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={!canEdit}
                  id={`rating-max-label-${question.id}`}
                  maxLength={200}
                  onChange={(event) =>
                    setRatingMaxLabel(event.target.value)
                  }
                  placeholder="مثلاً: عالی"
                  type="text"
                  value={ratingMaxLabel}
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Max selections for multiple choice */}
        {type === "MULTIPLE_CHOICE" ? (
          <div className="grid gap-1.5">
            <FieldLabel htmlFor={`max-selections-${question.id}`}>
              حداکثر تعداد انتخاب (اختیاری)
            </FieldLabel>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              disabled={!canEdit}
              id={`max-selections-${question.id}`}
              min={1}
              onChange={(event) => setMaxSelections(event.target.value)}
              placeholder="بدون محدودیت"
              type="number"
              value={maxSelections}
            />
          </div>
        ) : null}

        {/* Option editor for choice questions */}
        {isChoiceType(type) ? (
          <OptionEditor
            canEdit={canEdit}
            canRandomize={canEdit}
            onAdded={onOptionAdded}
            onDeleted={onOptionDeleted}
            onOptionDirtyChange={handleOptionDirtyChange}
            onOptionUpdated={onOptionUpdated}
            options={question.options}
            questionId={question.id}
            randomizeOptions={question.randomizeOptions}
            surveyId={surveyId}
            onRandomizeToggle={(enabled) => onRandomizeToggle(question.id, enabled)}
          />
        ) : null}

        {/* Branching control */}
        {canEdit ? (
          <BranchingSection
            canEdit={canEdit}
            allQuestions={questions}
            currentQuestion={question}
            onConditionUpdated={onConditionUpdated}
            surveyId={surveyId}
          />
        ) : null}

        {canEdit ? (
          <div className="flex items-center gap-2 border-t pt-3">
            <Button disabled={saving} onClick={handleSave} size="sm" type="button">
              اعمال تغییرات سؤال
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
        ) : null}
      </div> : null}
    </div>
  );
}

type OptionEditorProps = {
  canEdit: boolean;
  canRandomize: boolean;
  options: { id: string; label: string; sortOrder: number }[];
  questionId: string;
  randomizeOptions: boolean;
  surveyId: string;
  onAdded: (option: OptionData) => void;
  onDeleted: (optionId: string) => void;
  onOptionDirtyChange: (optionId: string, dirty: boolean) => void;
  onOptionUpdated: (option: OptionData) => void;
  onRandomizeToggle: (enabled: boolean) => void;
};

function OptionEditor({
  canEdit,
  canRandomize,
  options,
  questionId,
  randomizeOptions,
  surveyId,
  onAdded,
  onDeleted,
  onOptionDirtyChange,
  onOptionUpdated,
  onRandomizeToggle,
}: OptionEditorProps) {
  return (
    <div className="grid gap-3 rounded-md border border-dashed p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          گزینه‌ها
        </p>
        {canRandomize ? (
          <label className="flex items-center gap-2 text-xs">
            <input
              checked={randomizeOptions}
              className="h-3.5 w-3.5"
              onChange={(event) =>
                onRandomizeToggle(event.target.checked)
              }
              type="checkbox"
            />
            <span>نمایش تصادفی گزینه‌ها</span>
          </label>
        ) : null}
      </div>

      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          هنوز گزینه‌ای اضافه نشده است.
        </p>
      ) : (
        <ol className="grid gap-2">
          {options.map((option, optIndex) => (
            <OptionRow
              canEdit={canEdit}
              isFirst={optIndex === 0}
              isLast={optIndex === options.length - 1}
              key={option.id}
              onDeleted={onDeleted}
              onDirtyChange={onOptionDirtyChange}
              onUpdated={onOptionUpdated}
              option={option}
              options={options}
              questionId={questionId}
              surveyId={surveyId}
            />
          ))}
        </ol>
      )}

      {canEdit ? (
        <AddOptionForm
          onDirtyChange={onOptionDirtyChange}
          onAdded={onAdded}
          questionId={questionId}
          surveyId={surveyId}
        />
      ) : null}
    </div>
  );
}

type OptionRowProps = {
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onDeleted: (optionId: string) => void;
  onDirtyChange: (optionId: string, dirty: boolean) => void;
  onUpdated: (option: OptionData) => void;
  option: { id: string; label: string; sortOrder: number };
  options: { id: string; label: string; sortOrder: number }[];
  questionId: string;
  surveyId: string;
};

function OptionRow({
  canEdit,
  isFirst,
  isLast,
  onDeleted,
  onDirtyChange,
  onUpdated,
  option,
  options,
  questionId,
  surveyId,
}: OptionRowProps) {
  const [label, setLabel] = useState(option.label);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("questionId", questionId);
    form.set("optionId", option.id);
    form.set("label", label);

    try {
      const result = await updateOptionAction({}, form);
      if (result.status === "success" && result.option) {
        onUpdated(result.option);
        onDirtyChange(option.id, false);
        setMessage("ذخیره شد");
      } else {
        setMessage(result.message ?? "ذخیره گزینه ناموفق بود.");
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
    form.set("questionId", questionId);
    form.set("optionId", option.id);

    try {
      const result = await deleteOptionAction({}, form);
      if (result.status === "success") {
        onDirtyChange(option.id, false);
        onDeleted(option.id);
      } else {
        setMessage(result.message ?? "حذف گزینه ناموفق بود.");
        setConfirmingDelete(false);
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handleMoveUp() {
    if (isFirst) return;
    const currentIndex = options.findIndex((o) => o.id === option.id);
    const newOrder = [...options];
    const temp = newOrder[currentIndex - 1];
    newOrder[currentIndex - 1] = newOrder[currentIndex];
    newOrder[currentIndex] = temp;

    const result = await reorderOptionsAction(
      newOrder.map((o) => o.id),
      surveyId,
      questionId,
    );
    if (result.status === "success") {
      // The parent will re-render with new server data
    }
  }

  async function handleMoveDown() {
    if (isLast) return;
    const currentIndex = options.findIndex((o) => o.id === option.id);
    const newOrder = [...options];
    const temp = newOrder[currentIndex + 1];
    newOrder[currentIndex + 1] = newOrder[currentIndex];
    newOrder[currentIndex] = temp;

    const result = await reorderOptionsAction(
      newOrder.map((o) => o.id),
      surveyId,
      questionId,
    );
    if (result.status === "success") {
      // The parent will re-render with new server data
    }
  }

  return (
    <li className="grid gap-2">
      <div className="flex items-center gap-2">
        <input
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          disabled={!canEdit}
          maxLength={500}
          onChange={(event) => {
            const nextLabel = event.target.value;
            setLabel(nextLabel);
            onDirtyChange(option.id, nextLabel !== option.label);
          }}
          type="text"
          value={label}
        />
        {canEdit ? (
          <div className="flex items-center gap-1">
            <Button
              disabled={isFirst}
              onClick={handleMoveUp}
              size="sm"
              type="button"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label="انتقال گزینه به بالا"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              disabled={isLast}
              onClick={handleMoveDown}
              size="sm"
              type="button"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label="انتقال گزینه به پایین"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      {message ? (
        <p
          className={`text-xs ${message === "ذخیره شد" ? "text-green-600" : "text-destructive"}`}
        >
          {message}
        </p>
      ) : null}

      {canEdit ? (
        <div className="flex items-center gap-2">
            <Button disabled={saving} onClick={handleSave} size="sm" type="button">
            ثبت گزینه
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
                تأیید
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
      ) : null}
    </li>
  );
}

type AddOptionFormProps = {
  onDirtyChange: (optionId: string, dirty: boolean) => void;
  onAdded: (option: OptionData) => void;
  questionId: string;
  surveyId: string;
};

function AddOptionForm({
  onDirtyChange,
  onAdded,
  questionId,
  surveyId,
}: AddOptionFormProps) {
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("questionId", questionId);
    form.set("label", label);

    try {
      const result = await addOptionAction({}, form);
      if (result.status === "success" && result.option) {
        onAdded(result.option);
        setLabel("");
        onDirtyChange("new", false);
      } else {
        setMessage(result.message ?? "افزودن گزینه ناموفق بود.");
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex items-end gap-2" onSubmit={handleSubmit}>
      <div className="grid flex-1 gap-1">
        <FieldLabel htmlFor={`add-option-${questionId}`}>
          گزینه جدید
        </FieldLabel>
        <input
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          id={`add-option-${questionId}`}
          maxLength={500}
          onChange={(event) => {
            const nextLabel = event.target.value;
            setLabel(nextLabel);
            onDirtyChange("new", nextLabel.trim().length > 0);
          }}
          required
          type="text"
          value={label}
        />
      </div>
      <Button disabled={pending} size="sm" type="submit">
        <Plus className="h-3.5 w-3.5" />
        افزودن
      </Button>
      {message ? (
        <p className="text-xs text-destructive">{message}</p>
      ) : null}
    </form>
  );
}

// ──────────────────────────────────────────────
// Branching section
// ──────────────────────────────────────────────

type BranchingSectionProps = {
  canEdit: boolean;
  allQuestions: QuestionWithOptions[];
  currentQuestion: QuestionWithOptions;
  onConditionUpdated: (condition: QuestionConditionData | null) => void;
  surveyId: string;
};

const CONDITION_OPERATOR_LABELS = new Map<SurveyConditionOperator, string>([
  ["IS_SELECTED", "گزینه انتخاب شده باشد"],
  ["IS_NOT_SELECTED", "گزینه انتخاب نشده باشد"],
]);

function BranchingSection({
  allQuestions,
  currentQuestion,
  onConditionUpdated,
  surveyId,
}: BranchingSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [sourceQuestionId, setSourceQuestionId] = useState(
    currentQuestion.targetCondition?.sourceQuestionId ?? "",
  );
  const [sourceOptionId, setSourceOptionId] = useState(
    currentQuestion.targetCondition?.sourceOptionId ?? "",
  );
  const [operator, setOperator] = useState<SurveyConditionOperator>(
    currentQuestion.targetCondition?.operator ?? "IS_SELECTED",
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sourceOptions = useMemo(() => {
    if (!sourceQuestionId) return [];
    const src = allQuestions.find((q) => q.id === sourceQuestionId);
    return src?.options ?? [];
  }, [sourceQuestionId, allQuestions]);

  const earlierChoiceQuestions = useMemo(() => {
    const currentIdx = allQuestions.findIndex(
      (q) => q.id === currentQuestion.id,
    );
    return allQuestions
      .filter(
        (q) =>
          q.id !== currentQuestion.id &&
          isChoiceType(q.type) &&
          q.sortOrder < currentQuestion.sortOrder,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [allQuestions, currentQuestion]);

  const staleCondition =
    currentQuestion.targetCondition !== null &&
    earlierChoiceQuestions.every(
      (q) => q.id !== currentQuestion.targetCondition?.sourceQuestionId,
    );

  const currentOptions = staleCondition ? [] : sourceOptions;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceQuestionId || !sourceOptionId) return;
    setPending(true);
    setMessage(null);

    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("targetQuestionId", currentQuestion.id);
    form.set("sourceQuestionId", sourceQuestionId);
    form.set("sourceOptionId", sourceOptionId);
    form.set("operator", operator);

    try {
      const result = await setQuestionConditionAction({}, form);
      if (result.status === "success") {
        setShowForm(false);
        setMessage("شرط نمایش با موفقیت ذخیره شد.");
        onConditionUpdated(result.condition ?? null);
        setSourceQuestionId("");
        setSourceOptionId("");
      } else {
        setMessage(result.message ?? "ذخیره شرط ناموفق بود.");
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setPending(false);
    }
  }

  async function handleRemove() {
    setPending(true);
    setMessage(null);
    setShowForm(false);

    const form = new FormData();
    form.set("surveyId", surveyId);
    form.set("targetQuestionId", currentQuestion.id);

    try {
      const result = await removeQuestionConditionAction({}, form);
      if (result.status === "success") {
        setMessage("شرط نمایش حذف شد.");
        onConditionUpdated(null);
      } else {
        setMessage(result.message ?? "حذف شرط ناموفق بود.");
        if (result.status === "error") setShowForm(true);
      }
    } catch {
      setMessage("خطای غیرمنتظره‌ای رخ داد.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">
          منطق نمایش
        </p>
        </div>
        {!showForm ? (
          <Button className="h-8 px-2.5 text-xs" disabled={pending} onClick={() => setShowForm(true)} size="sm" type="button" variant="outline">
            {currentQuestion.targetCondition ? "ویرایش شرط" : "تنظیم شرط"}
          </Button>
        ) : null}
      </div>

      {!showForm && !currentQuestion.targetCondition ? (
        <p className="text-xs text-muted-foreground">این سؤال همیشه نمایش داده می‌شود.</p>
      ) : null}

      {staleCondition ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs text-red-700">
            شرط فعلی نامعتبر است: سوال مرجع حذف یا جابه‌جا شده است. لطفاً
            شرط را بازبینی کنید.
          </p>
        </div>
      ) : null}

      {currentQuestion.targetCondition && !showForm ? (
        <div className="rounded-md border bg-muted px-3 py-2">
          <p className="text-xs">
            اگر در سوال{" "}
            <span className="font-medium">
              {currentQuestion.targetCondition.sourceQuestionPrompt}
            </span>{" "}
            گزینه{` `}
            <span className="font-medium">
              {currentQuestion.targetCondition.sourceOptionLabel}
            </span>{" "}
            {CONDITION_OPERATOR_LABELS.get(
              currentQuestion.targetCondition.operator,
            )}{" "}
            باشد، این سوال نشان داده شود.
          </p>
          {!pending ? <Button className="mt-2 h-7 gap-1 px-2 text-xs" onClick={handleRemove} size="sm" type="button" variant="ghost">حذف شرط</Button> : null}
        </div>
      ) : null}

      {showForm ? (
        <form className="grid gap-2" onSubmit={handleSubmit}>
          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">
              سوال مرجع (باید قبلاً ساخته شده باشد)
            </label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              disabled={pending}
              onChange={(e) => {
                setSourceQuestionId(e.target.value);
                setSourceOptionId("");
              }}
              value={sourceQuestionId}
              required
            >
              <option value="">— انتخاب کنید —</option>
              {earlierChoiceQuestions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.prompt}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">
              گزینه مرجع
            </label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              disabled={pending || !sourceQuestionId}
              onChange={(e) => setSourceOptionId(e.target.value)}
              value={sourceOptionId}
              required
            >
              <option value="">— انتخاب کنید —</option>
              {currentOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">عملگر</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              disabled={pending}
              onChange={(e) =>
                setOperator(e.target.value as SurveyConditionOperator)
              }
              value={operator}
            >
              <option value="IS_SELECTED">انتخاب شده باشد</option>
              <option value="IS_NOT_SELECTED">انتخاب نشده باشد</option>
            </select>
          </div>

          {message ? (
            <p className="text-xs text-destructive">{message}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              disabled={pending}
              size="sm"
              type="submit"
            >
              ذخیره شرط
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                setShowForm(false);
                setMessage(null);
                setSourceQuestionId("");
                setSourceOptionId("");
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              انصراف
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
