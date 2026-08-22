"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mergeSurveyAiReplaceAfter, surveyAiReplaceFieldKeys } from "@/lib/survey-ai-fields";

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

async function requestProposal(request: AiRequest): Promise<Proposal> {
  const response = await fetch("/api/survey-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const data = (await response.json()) as Proposal & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "دریافت نتیجه ناموفق بود.");
  return data;
}

async function applyProposal(proposal: Proposal, acceptedOperations: number[], options?: { removeOperationIndexes?: number[]; confirmRemovals?: boolean; replaceFieldSelections?: Array<{ operationIndex: number; fields: string[] }> }): Promise<void> {
  const response = await fetch("/api/survey-ai/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal, acceptedOperations, removeOperationIndexes: options?.removeOperationIndexes ?? [], confirmRemovals: options?.confirmRemovals ?? false, replaceFieldSelections: options?.replaceFieldSelections ?? [] }),
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? "اعمال پیشنهاد ناموفق بود.");
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

function FieldAcceptanceRow({ row, checked, disabled, onToggle }: { row: ReplaceFieldRow; checked: boolean; disabled: boolean; onToggle: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-primary/30 bg-primary/[0.04] p-3">
      <input aria-label={`پذیرش ${row.title}`} checked={checked} className="mt-1 h-4 w-4 shrink-0" disabled={disabled} onChange={(event) => onToggle(event.target.checked)} type="checkbox" />
      <span className="grid min-w-0 gap-1 text-sm">
        <span className="font-medium">{row.title}</span>
        <span className="text-xs leading-5 text-muted-foreground">فعلی: {row.current || "خالی"}</span>
        <span className="leading-6">پیشنهادی: {row.proposed || "خالی"}</span>
      </span>
    </label>
  );
}

function ReplacementProposal({ operation, pending, onApply, onReject }: { operation: Operation; pending: boolean; onApply: (acceptedFields: string[]) => void; onReject: () => void }) {
  const before = operation.before;
  const after = operation.after;
  const rows = useMemo(() => before && after ? replaceFieldRows(before, after) : [], [before, after]);
  const [accepted, setAccepted] = useState<string[]>(rows.map((row) => row.key));
  // Rows are memoized on the proposal payload, so this resets to "all selected"
  // whenever a brand-new proposal lands on the same tree position.
  useEffect(() => { setAccepted(rows.map((row) => row.key)); }, [rows]);

  function toggle(key: string, checked: boolean) {
    setAccepted((current) => checked ? [...current, key] : current.filter((item) => item !== key));
  }

  if (!before || !after || rows.length === 0) return null;
  return (
    <div className="grid gap-3 rounded-md border border-primary/30 bg-background p-3">
      <div>
        <h5 className="text-sm font-medium">بازنویسی پیشنهادی</h5>
        <p className="mt-1 text-xs text-muted-foreground">هر تغییر را جداگانه بپذیرید یا رد کنید؛ فقط موارد انتخاب‌شده اعمال می‌شوند.</p>
      </div>
      <div className="grid gap-2">
        {rows.map((row) => <FieldAcceptanceRow checked={accepted.includes(row.key)} disabled={pending} key={row.key} onToggle={(checked) => toggle(row.key, checked)} row={row} />)}
      </div>
      <div className="flex flex-wrap gap-2"><Button disabled={pending || accepted.length === 0} onClick={() => onApply(accepted)} size="sm" type="button">پذیرش تغییرهای انتخاب‌شده</Button><Button disabled={pending} onClick={onReject} size="sm" type="button" variant="outline">رد پیشنهاد</Button></div>
    </div>
  );
}

function OperationsList({ operations, selected, onToggle }: { operations: Operation[]; selected: number[]; onToggle: (index: number, checked: boolean) => void }) {
  return (
    <div className="grid gap-2">
      {operations.map((operation, index) => (
        <label className="flex min-w-0 items-start gap-2 rounded-md border bg-background p-3 text-sm" key={index}>
          <input checked={selected.includes(index)} className="mt-1 h-4 w-4 shrink-0" onChange={(event) => onToggle(index, event.target.checked)} type="checkbox" />
          <span className="min-w-0 leading-6">{operation.op === "add" ? `افزودن: ${operation.question?.prompt ?? "سؤال جدید"}` : operation.op === "remove" ? `حذف: ${operation.before?.prompt ?? "سؤال"}` : `بازنویسی: ${operation.after?.prompt ?? "سؤال"}`}</span>
        </label>
      ))}
    </div>
  );
}

export function SurveyAiPanel({ surveyId, disabled }: { surveyId: string; disabled?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"suggest" | "review">("suggest");
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);

  async function run() {
    setPending(true); setMessage(null);
    try {
      const result = await requestProposal({ surveyId, mode, ...(mode === "suggest" ? { brief: text } : {}) });
      setProposal(result); setSelected(result.operations.map((_, index) => index));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "دریافت نتیجه ناموفق بود.");
    } finally { setPending(false); }
  }

  async function apply() {
    if (!proposal) return;
    const removals = proposal.operations.map((operation, index) => operation.op === "remove" && selected.includes(index) ? index : -1).filter((index) => index >= 0);
    if (removals.length > 0 && !window.confirm("حذف سؤال‌های انتخاب‌شده قطعی است؟ این عملیات قابل بازگشت نیست.")) return;
    setPending(true); setMessage(null);
    try { await applyProposal(proposal, selected, { removeOperationIndexes: removals, confirmRemovals: removals.length > 0 }); setProposal(null); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "اعمال پیشنهاد ناموفق بود."); }
    finally { setPending(false); }
  }

  if (disabled) return null;
  return (
    <section className="grid gap-3 rounded-md border bg-muted/20 p-4" aria-labelledby="survey-ai-title">
      <div><h3 className="font-semibold" id="survey-ai-title">کمک با هوش مصنوعی</h3><p className="text-xs text-muted-foreground">پیشنهادها تا وقتی شما نپذیرید روی پیش‌نویس اعمال نمی‌شوند.</p></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="نوع کمک کلی نظرسنجی">
        <Button onClick={() => { setMode("suggest"); setProposal(null); }} size="sm" type="button" variant={mode === "suggest" ? "default" : "outline"}>ساخت سؤال از brief</Button>
        <Button onClick={() => { setMode("review"); setProposal(null); }} size="sm" type="button" variant={mode === "review" ? "default" : "outline"}>بازبینی کل پیش‌نویس</Button>
      </div>
      {mode === "suggest" ? <div className="grid gap-1.5"><label className="text-sm font-medium" htmlFor="survey-ai-brief">brief فارسی</label><textarea aria-describedby="survey-ai-brief-hint" className="min-h-24 rounded-md border bg-background p-3 text-sm" id="survey-ai-brief" maxLength={4000} onChange={(event) => setText(event.target.value)} value={text} /><p className="text-xs text-muted-foreground" id="survey-ai-brief-hint">هدف و مخاطب نظرسنجی را کوتاه توضیح دهید.</p></div> : <p className="text-sm text-muted-foreground">همهٔ سؤال‌های پیش‌نویس از نظر کیفیت سؤال و گزینه‌ها بررسی می‌شوند.</p>}
      <Button disabled={pending || (mode === "suggest" && !text.trim())} onClick={run} type="button">{pending ? "در حال بررسی…" : mode === "review" ? "شروع بازبینی کل" : "ساخت سؤال‌های پیشنهادی"}</Button>
      {message ? <p className="text-sm text-destructive" role="alert">{message}</p> : null}
      {proposal ? <div className="grid gap-3 border-t pt-3"><div><h4 className="font-medium">نتیجهٔ قابل بررسی</h4><p className="text-xs text-muted-foreground">هیچ تغییری بدون پذیرش صریح شما اعمال نمی‌شود.</p></div><DiagnosticList diagnostics={proposal.diagnostics} />{proposal.operations.length > 0 ? <OperationsList operations={proposal.operations} selected={selected} onToggle={(index, checked) => setSelected((current) => checked ? [...current, index] : current.filter((item) => item !== index))} /> : null}{proposal.operations.length > 0 ? <Button disabled={pending || selected.length === 0} onClick={apply} type="button">پذیرش پیشنهادهای انتخاب‌شده</Button> : null}<p className="text-xs text-muted-foreground">{mode === "review" ? "بازبینی کل فقط نظر می‌دهد و هیچ تغییری پیشنهاد یا اعمال نمی‌کند." : "پیشنهادهای ساخت سؤال فقط پس از انتخاب و پذیرش شما اعمال می‌شوند."}</p></div> : null}
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

export function SurveyAiQuestionReview({ surveyId, questionId, revision, disabled = false, open, onClose, onApplied }: { surveyId: string; questionId: string; revision?: string; disabled?: boolean; open: boolean; onClose: () => void; onApplied?: (question: SurveyAiQuestionPayload) => void }) {
  const router = useRouter();
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

  async function acceptRewrite(operation: Operation, sourceProposal: Proposal, acceptedFields: string[]) {
    if (!operation.before || !operation.after || disabled) return;
    const operationIndex = sourceProposal.operations.indexOf(operation);
    setPending(true); setMessage(null);
    try {
      await applyProposal(sourceProposal, [operationIndex], { replaceFieldSelections: [{ operationIndex, fields: acceptedFields }] });
      onApplied?.(mergeSurveyAiReplaceAfter(operation.before, operation.after, new Set(acceptedFields)));
      setProposal(null); setMessage("تغییرهای انتخاب‌شده با پذیرش شما اعمال شد."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "اعمال بازنویسی ناموفق بود."); }
    finally { setPending(false); }
  }

  function dismissReplacement(sourceProposal: Proposal, operation: Operation) {
    if (sourceProposal === proposal) {
      setProposal((current) => current ? { ...current, operations: current.operations.filter((item) => item !== operation) } : null);
      return;
    }
    setHistory((current) => current.map((item) => item.proposal === sourceProposal ? { ...item, proposal: { ...item.proposal, operations: item.proposal.operations.filter((candidate) => candidate !== operation) } } : item));
  }

  function renderResult(result: Proposal) {
    const replacement = result.operations.find((operation) => operation.op === "replace");
    return <div className="grid gap-3"><DiagnosticList diagnostics={result.diagnostics} />{replacement ? <ReplacementProposal operation={replacement} pending={pending || disabled} onApply={(acceptedFields) => void acceptRewrite(replacement, result, acceptedFields)} onReject={() => dismissReplacement(result, replacement)} /> : null}</div>;
  }

  if (!open) return null;

  return (
    <div className="grid gap-3 border-t px-4 pb-4 pt-3" aria-live="polite" id={`survey-ai-review-${questionId}`}>
      <div><h4 className="text-sm font-semibold">بررسی همین سؤال</h4><p className="text-xs text-muted-foreground">وضوح، جهت‌داری، دوگانگی، تناسب نوع پاسخ و کامل‌بودن گزینه‌ها بررسی می‌شود؛ تغییری خودکار اعمال نمی‌شود.</p></div>{pending && !proposal ? <p className="text-sm text-muted-foreground">در حال بررسی همین سؤال…</p> : null}{message ? <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3"><p className="text-sm text-destructive" role="alert">{message}</p><Button disabled={pending || disabled} onClick={() => setReviewAttempt((current) => current + 1)} size="sm" type="button" variant="outline">تلاش دوباره</Button></div> : null}{proposal ? renderResult(proposal) : null}{history.map((item, index) => <div className="grid gap-2 border-t pt-3" key={`${item.question}-${index}`}><p className="text-xs font-medium text-muted-foreground">پرسش مستقل قبلی: {item.question}</p>{renderResult(item.proposal)}</div>)}<form className="grid gap-2 border-t pt-3" onSubmit={askFollowup}><label className="text-sm font-medium" htmlFor={`survey-ai-followup-${questionId}`}>دربارهٔ همین سؤال بپرسید</label><textarea aria-describedby={`survey-ai-followup-hint-${questionId}`} className="min-h-20 rounded-md border bg-background p-3 text-sm" disabled={pending || disabled} id={`survey-ai-followup-${questionId}`} maxLength={1200} onChange={(event) => setFollowup(event.target.value)} placeholder="مثلاً: چرا جهت‌دار است؟ یا رسمی‌ترش کن" value={followup} /><p className="text-xs text-muted-foreground" id={`survey-ai-followup-hint-${questionId}`}>هر پرسش مستقل است و فقط بر اساس همین سؤال پاسخ می‌گیرد؛ پیام‌های قبلی به مدل فرستاده نمی‌شوند. تغییرها جداگانه برای پذیرش نمایش داده می‌شوند.</p><Button disabled={pending || disabled || !followup.trim()} size="sm" type="submit">{pending ? "در حال پاسخ…" : "پرسیدن"}</Button></form>
    </div>
  );
}
