"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { surveyAiReplaceFieldKeys } from "@/lib/survey-ai-fields";

export type SurveyAiQuestionPayload = {
  id?: string;
  prompt: string;
  helpText?: string | null;
  type?: string;
  required?: boolean;
  options?: Array<{ id?: string; label: string }>;
  randomizeOptions?: boolean;
  ratingMin?: number | null;
  ratingMax?: number | null;
  ratingMinLabel?: string | null;
  ratingMaxLabel?: string | null;
  maxSelections?: number | null;
};

type Operation = {
  op: "add" | "replace" | "remove";
  questionId?: string;
  question?: SurveyAiQuestionPayload;
  before?: SurveyAiQuestionPayload;
  after?: SurveyAiQuestionPayload;
};

type Diagnostic = {
  severity: "info" | "warning";
  title: string;
  detail: string;
  questionId?: string;
};

type Proposal = {
  surveyId: string;
  snapshot: string;
  signature: string;
  kind: string;
  operations: Operation[];
  diagnostics: Diagnostic[];
};

type AiRequest = {
  surveyId: string;
  mode: "suggest" | "review" | "question-review" | "question-followup";
  questionId?: string;
  brief?: string;
  instruction?: string;
};

const persianNumber = new Intl.NumberFormat("fa-IR");

const GENERATION_FAILED_MESSAGE = "نتوانستیم سؤال‌های پیشنهادی را بسازیم. لطفاً دوباره تلاش کنید.";
const ADD_FAILED_MESSAGE = "افزودن سؤال‌ها ناموفق بود. لطفاً دوباره تلاش کنید.";
const REVIEW_FAILED_MESSAGE = "بازبینی انجام نشد. لطفاً دوباره تلاش کنید.";

async function requestProposal(request: AiRequest): Promise<Proposal> {
  const response = await fetch("/api/survey-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const data = (await response.json()) as Proposal & { error?: string };
  if (!response.ok) throw new Error(data.error ?? REVIEW_FAILED_MESSAGE);
  return data;
}

async function generateSuggestions(surveyId: string, brief: string): Promise<Proposal> {
  let response: Response;
  try {
    response = await fetch("/api/survey-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surveyId, mode: "suggest", brief }),
    });
  } catch (error) {
    console.error("Survey AI suggestion request failed:", error);
    throw new Error(GENERATION_FAILED_MESSAGE);
  }
  const data = (await response.json().catch(() => null)) as (Proposal & { error?: string }) | null;
  if (!response.ok) {
    // Deliberate business-rule rejections (rate limit, permissions, draft state)
    // arrive as 409 with a message written for the user; anything else stays generic.
    if (response.status === 409 && typeof data?.error === "string") throw new Error(data.error);
    console.error("Survey AI suggestion failed:", data?.error ?? response.status);
    throw new Error(GENERATION_FAILED_MESSAGE);
  }
  if (!data || !Array.isArray(data.operations)) throw new Error(GENERATION_FAILED_MESSAGE);
  return data;
}

async function addSuggestions(proposal: Proposal, acceptedOperations: number[]): Promise<number> {
  const response = await fetch("/api/survey-ai/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal, acceptedOperations, removeOperationIndexes: [], confirmRemovals: false, replaceFieldSelections: [] }),
  });
  const data = (await response.json().catch(() => null)) as ({ applied?: number } & { error?: string }) | null;
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : ADD_FAILED_MESSAGE);
  return typeof data?.applied === "number" ? data.applied : acceptedOperations.length;
}

function DiagnosticList({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) {
    return <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">مورد مهمی در این بررسی پیدا نشد.</p>;
  }
  return (
    <div className="grid gap-2" aria-live="polite">
      {diagnostics.map((diagnostic, index) => (
        <div className={`rounded-md border p-3 text-sm ${diagnostic.severity === "warning" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-sky-200 bg-sky-50 text-sky-950"}`} key={`${diagnostic.title}-${index}`}>
          <p className="font-medium">{diagnostic.title}</p>
          <p className="mt-1 leading-6">{diagnostic.detail}</p>
        </div>
      ))}
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2" role="alert">
      <p className="text-sm leading-6 text-destructive">{message}</p>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">تلاش دوباره</Button>
    </div>
  );
}

function suggestionMetadata(question: SurveyAiQuestionPayload): string | null {
  const optionCount = question.options?.length ?? 0;
  switch (question.type) {
    case "RATING": {
      const scale = `امتیازدهی ${persianNumber.format(question.ratingMin ?? 1)} تا ${persianNumber.format(question.ratingMax ?? 5)}`;
      const labels = [question.ratingMinLabel?.trim(), question.ratingMaxLabel?.trim()].filter(Boolean) as string[];
      return labels.length > 0 ? `${scale} · ${labels.join(" ↔ ")}` : scale;
    }
    case "SINGLE_CHOICE":
      return optionCount > 0 ? `تک‌گزینه‌ای · ${persianNumber.format(optionCount)} گزینه` : "تک‌گزینه‌ای";
    case "MULTIPLE_CHOICE":
      return optionCount > 0 ? `چندگزینه‌ای · ${persianNumber.format(optionCount)} گزینه` : "چندگزینه‌ای";
    case "LONG_TEXT":
      return "پاسخ بلند";
    default:
      return "پاسخ کوتاه";
  }
}

function SuggestionRow({ index, onToggle, question, selected }: { index: number; onToggle: (index: number, checked: boolean) => void; question: SurveyAiQuestionPayload; selected: boolean }) {
  const metadata = suggestionMetadata(question);
  return (
    <li>
      <label className="-mx-2 flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/60" htmlFor={`survey-ai-suggestion-${index}`}>
        <input checked={selected} className="mt-1.5 h-4 w-4 shrink-0" id={`survey-ai-suggestion-${index}`} onChange={(event) => onToggle(index, event.target.checked)} type="checkbox" />
        <span className="grid min-w-0 gap-0.5">
          <span className="break-words text-sm font-medium leading-6">{question.prompt}</span>
          {metadata ? <span className="text-xs leading-5 text-muted-foreground">{metadata}</span> : null}
        </span>
      </label>
    </li>
  );
}

type ReplaceFieldRow = { key: string; title: string; current: string; proposed: string };

function replaceFieldRows(before: SurveyAiQuestionPayload, after: SurveyAiQuestionPayload): ReplaceFieldRow[] {
  return surveyAiReplaceFieldKeys(before, after).flatMap((key) => {
    if (key === "prompt") return [{ key, title: "متن سؤال", current: before.prompt, proposed: after.prompt }];
    if (key === "helpText") return [{ key, title: "متن راهنما", current: before.helpText?.trim() ?? "", proposed: after.helpText?.trim() ?? "" }];
    const optionId = key.slice("option:".length);
    const current = (before.options ?? []).find((candidate) => candidate.id === optionId);
    const proposed = (after.options ?? []).find((candidate) => candidate.id === optionId);
    return current && proposed ? [{ key, title: "برچسب گزینه", current: current.label, proposed: proposed.label }] : [];
  });
}

function AdviceRewriteCard({ operation }: { operation: Operation }) {
  const before = operation.before;
  const after = operation.after;
  const rows = useMemo(() => (before && after ? replaceFieldRows(before, after) : []), [before, after]);
  if (!before || !after || rows.length === 0) return null;
  return (
    <div className="grid gap-2 rounded-md border border-sky-200 bg-sky-50 p-3">
      <div>
        <h5 className="text-sm font-medium">پیشنهاد بازنویسی (فقط راهنما)</h5>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">این پیشنهاد خودکار اعمال نمی‌شود؛ اگر مناسب بود، متن را در فرم همین سؤال خودتان به‌روز کنید.</p>
      </div>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div className="rounded-md border bg-background p-3 text-sm" key={row.key}>
            <p className="font-medium">{row.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">فعلی: {row.current || "خالی"}</p>
            <p className="leading-6">پیشنهادی: {row.proposed || "خالی"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SurveyAiPanel({ surveyId, disabled }: { surveyId: string; disabled?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"suggest" | "review">("suggest");
  const [brief, setBrief] = useState("");
  const [phase, setPhase] = useState<"input" | "suggestions">("input");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [suggestions, setSuggestions] = useState<SurveyAiQuestionPayload[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
  }, []);

  function clearResultState() {
    setProposal(null);
    setSuggestions([]);
    setSelected([]);
    setError(null);
    setPhase("input");
  }

  function switchMode(nextMode: "suggest" | "review") {
    if (nextMode === mode || pending) return;
    setMode(nextMode);
    clearResultState();
  }

  async function generate() {
    const trimmedBrief = brief.trim();
    if (!trimmedBrief || pending) return;
    setPending(true);
    setError(null);
    setAddedCount(null);
    try {
      const result = await generateSuggestions(surveyId, trimmedBrief);
      const questions = result.operations.flatMap((operation) => (operation.op === "add" && operation.question ? [operation.question] : []));
      setProposal(result);
      setSuggestions(questions);
      setSelected(result.operations.map((_, index) => index));
      setPhase("suggestions");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : GENERATION_FAILED_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  async function startReview() {
    if (pending) return;
    setPending(true);
    setError(null);
    setProposal(null);
    try {
      setProposal(await requestProposal({ surveyId, mode: "review" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : REVIEW_FAILED_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  async function addSelected() {
    if (!proposal || selected.length === 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      const applied = await addSuggestions(proposal, selected);
      setAddedCount(applied);
      clearResultState();
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
      addedTimerRef.current = setTimeout(() => setAddedCount(null), 6000);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ADD_FAILED_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  function toggleSuggestion(index: number, checked: boolean) {
    setSelected((current) => (checked ? [...current, index] : current.filter((item) => item !== index)));
  }

  if (disabled) return null;

  return (
    <section aria-labelledby="survey-ai-title" className="grid gap-4 rounded-md border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="font-semibold" id="survey-ai-title">کمک با هوش مصنوعی</h3>
        <div aria-label="انتخاب حالت کمک هوش مصنوعی" className="flex rounded-md bg-muted p-0.5" role="group">
          <button
            aria-pressed={mode === "suggest"}
            className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${mode === "suggest" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => switchMode("suggest")}
            type="button"
          >
            ساخت سؤال
          </button>
          <button
            aria-pressed={mode === "review"}
            className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${mode === "review" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => switchMode("review")}
            type="button"
          >
            بازبینی نظرسنجی
          </button>
        </div>
      </div>

      {addedCount !== null ? (
        <p className="text-sm text-green-700" role="status">{persianNumber.format(addedCount)} سؤال به نظرسنجی اضافه شد.</p>
      ) : null}

      {mode === "suggest" ? (
        phase === "suggestions" ? (
          <div aria-live="polite" className="grid gap-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-1">
              <h4 className="text-sm font-semibold">
                سؤال‌های پیشنهادی
                <span className="ms-2 text-xs font-normal text-muted-foreground">{persianNumber.format(suggestions.length)} سؤال</span>
              </h4>
              <Button className="h-8 px-2 text-xs" onClick={() => clearResultState()} size="sm" type="button" variant="ghost">ویرایش توضیحات</Button>
            </div>

            {suggestions.length > 0 ? (
              <ul className="grid">
                {suggestions.map((question, index) => (
                  <SuggestionRow
                    index={index}
                    key={`${question.prompt}-${index}`}
                    onToggle={toggleSuggestion}
                    question={question}
                    selected={selected.includes(index)}
                  />
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">چند سؤال پیشنهاد نشد. توضیح را کمی دقیق‌تر بنویسید یا دوباره تلاش کنید.</p>
            )}

            {error ? <InlineError message={error} onRetry={generate} /> : null}

            <div className="mt-2 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
              <Button className="w-full sm:w-auto" disabled={pending || selected.length === 0} onClick={addSelected} type="button">
                افزودن {persianNumber.format(selected.length)} سؤال انتخاب‌شده
              </Button>
              <Button className="w-full justify-center sm:w-auto" disabled={pending} onClick={generate} size="sm" type="button" variant="outline">
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                {pending ? "در حال ساخت…" : "ساخت پیشنهادهای جدید"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="survey-ai-brief">چه نظرسنجی‌ای می‌خواهید بسازید؟</label>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-input bg-background p-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              id="survey-ai-brief"
              maxLength={4000}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="مثلاً: می‌خواهیم میزان رضایت همکاران از نوبینو، سهولت پیدا کردن امکانات و تجربهٔ کلی رزرو را بسنجیم."
              value={brief}
            />
            <p className="text-xs text-muted-foreground">در یکی دو جمله موضوع و مخاطب نظرسنجی را بنویسید.</p>
            {error ? <InlineError message={error} onRetry={generate} /> : null}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button className="w-full sm:w-auto" disabled={pending || !brief.trim()} onClick={generate} type="button">
                {pending ? "در حال ساخت…" : "ساخت پیشنهاد سؤال‌ها"}
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="grid gap-3">
          <p className="text-sm leading-6 text-muted-foreground">کل پیش‌نویس از نظر وضوح، جهت‌داری و کامل‌بودن گزینه‌ها بررسی می‌شود؛ نتیجه فقط راهنماست و هیچ تغییری اعمال نمی‌شود.</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button className="w-full sm:w-auto" disabled={pending} onClick={startReview} type="button">
              {pending ? "در حال بازبینی…" : "شروع بازبینی"}
            </Button>
          </div>
          {error ? <InlineError message={error} onRetry={startReview} /> : null}
          {proposal ? (
            <div className="grid gap-2 pt-1">
              <h4 className="text-sm font-semibold">نتیجهٔ بازبینی</h4>
              <DiagnosticList diagnostics={proposal.diagnostics} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

type Followup = { question: string; proposal: Proposal };

export function SurveyAiQuestionReviewTrigger({ questionId, open, disabled = false, onToggle }: { questionId: string; open: boolean; disabled?: boolean; onToggle: () => void }) {
  const triggerLabel = open ? "بستن بررسی سؤال با هوش مصنوعی" : "بررسی سؤال با هوش مصنوعی";
  return (
    <Button
      aria-controls={`survey-ai-review-${questionId}`}
      aria-expanded={open}
      aria-label={triggerLabel}
      className="h-11 min-w-11 px-1.5 text-xs"
      disabled={disabled}
      onClick={onToggle}
      size="sm"
      title={triggerLabel}
      type="button"
      variant={open ? "outline" : "ghost"}
    >
      <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
      <span>{open ? "بستن" : "AI"}</span>
    </Button>
  );
}

export function SurveyAiQuestionReview({ surveyId, questionId, revision, disabled = false, open, onClose }: { surveyId: string; questionId: string; revision?: string; disabled?: boolean; open: boolean; onClose: () => void }) {
  const generationRef = useRef(0);
  const [reviewAttempt, setReviewAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [followup, setFollowup] = useState("");
  const [history, setHistory] = useState<Followup[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!disabled && revision === undefined) return;
    generationRef.current += 1;
    onClose();
    setProposal(null);
    setHistory([]);
    setMessage(null);
  }, [disabled, onClose, revision]);

  useEffect(() => {
    if (!open || disabled) return;
    void runReview();
    // Opening and an explicit retry should each start a fresh review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reviewAttempt]);

  async function runReview() {
    if (disabled) return;
    const generation = generationRef.current;
    setPending(true); setMessage(null); setProposal(null);
    try {
      const result = await requestProposal({ surveyId, mode: "question-review", questionId });
      if (generation === generationRef.current && !disabled) setProposal(result);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "بررسی سؤال ناموفق بود."); }
    finally { setPending(false); }
  }

  async function askFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = followup.trim();
    if (!question || pending || disabled) return;
    const generation = generationRef.current;
    setPending(true); setMessage(null);
    try {
      const result = await requestProposal({ surveyId, mode: "question-followup", questionId, instruction: question });
      if (generation === generationRef.current && !disabled) {
        setHistory((current) => [...current, { question, proposal: result }]); setFollowup("");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "پاسخ به پرسش تکمیلی ناموفق بود."); }
    finally { setPending(false); }
  }

  function renderResult(result: Proposal) {
    const replacements = result.operations.filter((operation) => operation.op === "replace");
    return <div className="grid gap-3"><DiagnosticList diagnostics={result.diagnostics} />{replacements.map((operation, index) => <AdviceRewriteCard key={index} operation={operation} />)}</div>;
  }

  if (!open) return null;

  return (
    <div className="grid gap-3 border-t px-4 pb-4 pt-3" aria-live="polite" id={`survey-ai-review-${questionId}`}>
      <div><h4 className="text-sm font-semibold">بررسی همین سؤال</h4><p className="text-xs text-muted-foreground">وضوح، جهت‌داری، دوگانگی، تناسب نوع پاسخ و کامل‌بودن گزینه‌ها بررسی می‌شود؛ نتیجه فقط جنبهٔ راهنمایی دارد و هیچ تغییری روی پیش‌نویس اعمال نمی‌شود.</p></div>{pending && !proposal ? <p className="text-sm text-muted-foreground">در حال بررسی همین سؤال…</p> : null}{message ? <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3"><p className="text-sm text-destructive" role="alert">{message}</p><Button disabled={pending || disabled} onClick={() => setReviewAttempt((current) => current + 1)} size="sm" type="button" variant="outline">تلاش دوباره</Button></div> : null}{proposal ? renderResult(proposal) : null}{history.map((item, index) => <div className="grid gap-2 border-t pt-3" key={`${item.question}-${index}`}><p className="text-xs font-medium text-muted-foreground">پرسش مستقل قبلی: {item.question}</p>{renderResult(item.proposal)}</div>)}<form className="grid gap-2 border-t pt-3" onSubmit={askFollowup}><label className="text-sm font-medium" htmlFor={`survey-ai-followup-${questionId}`}>دربارهٔ همین سؤال بپرسید</label><textarea aria-describedby={`survey-ai-followup-hint-${questionId}`} className="min-h-20 rounded-md border bg-background p-3 text-sm" disabled={pending || disabled} id={`survey-ai-followup-${questionId}`} maxLength={1200} onChange={(event) => setFollowup(event.target.value)} placeholder="مثلاً: چرا جهت‌دار است؟ یا رسمی‌ترش کن" value={followup} /><p className="text-xs text-muted-foreground" id={`survey-ai-followup-hint-${questionId}`}>هر پرسش مستقل است و فقط بر اساس همین سؤال پاسخ می‌گیرد؛ پیام‌های قبلی به مدل فرستاده نمی‌شوند. بازنویسی پیشنهادی فقط برای راهنمایی نمایش داده می‌شود.</p><Button disabled={pending || disabled || !followup.trim()} size="sm" type="submit">{pending ? "در حال پاسخ…" : "پرسیدن"}</Button></form>
    </div>
  );
}
