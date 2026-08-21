import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { SurveyQuestionType, SurveyState } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { requestAiJson } from "@/lib/ai-model-client";
import { canEditSurveyDraft } from "@/lib/survey-permissions";
import { resolveSurveyActor, loadActiveActorUser, SurveyServiceError } from "@/lib/survey-service/shared";
import { SURVEY_OPTION_LABEL_MAX_LENGTH, SURVEY_QUESTION_HELP_TEXT_MAX_LENGTH, SURVEY_QUESTION_PROMPT_MAX_LENGTH } from "@/lib/survey-validators";

const MAX_BRIEF = 4000;
const MAX_INSTRUCTION = 1200;
const MAX_QUESTIONS = 20;
const MAX_OPTIONS = 12;
const rate = new Map<string, number[]>();
const secret = () => process.env.SURVEY_AI_SECRET ?? process.env.AUTH_SECRET ?? "nobino-survey-ai-development-secret";

const optionSchema = z.object({ id: z.string().min(1).optional(), label: z.string().trim().min(1).max(SURVEY_OPTION_LABEL_MAX_LENGTH) }).strict();
const questionSchema = z.object({
  id: z.string().min(1).optional(), prompt: z.string().trim().min(1).max(SURVEY_QUESTION_PROMPT_MAX_LENGTH),
  helpText: z.string().trim().max(SURVEY_QUESTION_HELP_TEXT_MAX_LENGTH).nullable().optional(),
  type: z.nativeEnum(SurveyQuestionType), required: z.boolean().optional(),
  options: z.array(optionSchema).max(MAX_OPTIONS).optional(),
  ratingMin: z.number().int().min(0).max(10).nullable().optional(), ratingMax: z.number().int().min(0).max(10).nullable().optional(),
  maxSelections: z.number().int().min(1).max(MAX_OPTIONS).nullable().optional(),
}).strict();
const operationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), question: questionSchema.omit({ id: true }) }).strict(),
  z.object({ op: z.literal("replace"), questionId: z.string().min(1), before: questionSchema, after: questionSchema }).strict(),
  z.object({ op: z.literal("remove"), questionId: z.string().min(1), before: questionSchema }).strict(),
]);
const proposalSchema = z.object({ kind: z.enum(["suggest", "rewrite", "review"]), operations: z.array(operationSchema).max(MAX_QUESTIONS), diagnostics: z.array(z.object({ severity: z.enum(["info", "warning"]), title: z.string().min(1).max(200), detail: z.string().min(1).max(1000), questionId: z.string().optional() }).strict()).max(50) }).strict();
export type SurveyAiProposal = z.infer<typeof proposalSchema> & { surveyId: string; snapshot: string; signature: string };

function snapshotOf(questions: Array<{ id: string; prompt: string; helpText: string | null; type: SurveyQuestionType; required: boolean; options: Array<{ id: string; label: string }> }>) {
  return JSON.stringify(questions.map((q) => ({ id: q.id, prompt: q.prompt, helpText: q.helpText, type: q.type, required: q.required, options: q.options.map((o) => ({ id: o.id, label: o.label })) })));
}
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("hex"); }
function assertSignature(proposal: SurveyAiProposal) { const expected = sign(`${proposal.surveyId}:${proposal.snapshot}`); if (expected.length !== proposal.signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(proposal.signature))) throw new SurveyServiceError("پیشنهاد هوش مصنوعی معتبر نیست."); }
async function loadAuthorized(surveyId: string, actorUserId: string) {
  const survey = await db.survey.findUnique({ where: { id: surveyId }, select: { id: true, state: true, ownerId: true, questions: { select: { id: true, prompt: true, helpText: true, type: true, required: true, options: { select: { id: true, label: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } });
  if (!survey || survey.state !== SurveyState.DRAFT) throw new SurveyServiceError("هوش مصنوعی فقط روی پیش‌نویس کار می‌کند.");
  const user = await loadActiveActorUser(actorUserId, db);
  const actor = await resolveSurveyActor(db, { actorUserId, surveyId, ownerId: survey.ownerId, user });
  if (!canEditSurveyDraft(actor, survey.state)) throw new SurveyServiceError("مجوز ویرایش این پیش‌نویس را ندارید.");
  return survey;
}
function checkRate(actorUserId: string) { const now = Date.now(); const values = (rate.get(actorUserId) ?? []).filter((x) => now - x < 60_000); if (values.length >= 6) throw new SurveyServiceError("تعداد درخواست‌های هوش مصنوعی زیاد است؛ یک دقیقه دیگر دوباره تلاش کنید."); values.push(now); rate.set(actorUserId, values); }

export async function createSurveyAiProposal(input: { actorUserId: string; surveyId: string; mode: "suggest" | "rewrite" | "review"; brief?: string; instruction?: string; questionId?: string }): Promise<SurveyAiProposal> {
  checkRate(input.actorUserId); const survey = await loadAuthorized(input.surveyId, input.actorUserId);
  const text = input.mode === "suggest" ? input.brief?.trim() : input.instruction?.trim();
  if (input.mode !== "review" && (!text || text.length > (input.mode === "suggest" ? MAX_BRIEF : MAX_INSTRUCTION))) throw new SurveyServiceError("متن درخواست بیش از حد طولانی یا خالی است.");
  const current = snapshotOf(survey.questions); const context = JSON.stringify(survey.questions.map((q) => ({ id: q.id, prompt: q.prompt, helpText: q.helpText, type: q.type, required: q.required, options: q.options })));
  const systemPrompt = "شما دستیار طراحی نظرسنجی فارسی هستید. فقط JSON مطابق قرارداد خروجی بدهید؛ هیچ متن اضافی، تغییر تنظیمات نظرسنجی یا branching خودکار مجاز نیست. عملیات remove فقط برای diagnostic پیشنهاد شود.";
  const userPrompt = input.mode === "review" ? `این پیش‌نویس را از نظر ابهام، جهت‌داری، سؤال دوگانه، تکرار، گزینه ناقص و branching دستی بررسی کن. عملیات تغییر نساز و فقط diagnostic بده.\n${context}` : input.mode === "suggest" ? `از brief زیر حداکثر ${MAX_QUESTIONS} سؤال پیشنهادی بساز.\nBrief: ${text}` : `سؤال با شناسه ${input.questionId ?? ""} را فقط با دستور زیر بازنویسی کن. اگر شناسه در متن نبود عملیات نساز.\nدستور: ${text}\nپیش‌نویس: ${context}`;
  const parsed = proposalSchema.safeParse({ ...(await requestAiJson({ systemPrompt, userPrompt, maxOutputTokens: 3000 }) as object), kind: input.mode });
  if (!parsed.success) throw new SurveyServiceError("پاسخ مدل ساختار معتبر ندارد.");
  const ids = new Set(survey.questions.map((q) => q.id));
  for (const op of parsed.data.operations) { if (op.op !== "add" && !ids.has(op.questionId)) throw new SurveyServiceError("پاسخ مدل شامل شناسه سؤال ناشناخته است."); if (op.op === "replace" && (!ids.has(op.before.id ?? "") || op.before.id !== op.questionId || !op.after.id || op.after.id !== op.questionId)) throw new SurveyServiceError("شناسه سؤال پیشنهادی معتبر نیست."); }
  return { ...parsed.data, surveyId: input.surveyId, snapshot: current, signature: sign(`${input.surveyId}:${current}`) };
}

export async function applySurveyAiProposal(input: { actorUserId: string; proposal: SurveyAiProposal; acceptedOperations?: number[]; removeOperationIndexes?: number[]; confirmRemovals?: boolean }) {
  const proposal = input.proposal;
  const parsedProposal = proposalSchema.safeParse(proposal);
  if (!parsedProposal.success || typeof proposal.surveyId !== "string" || typeof proposal.snapshot !== "string" || typeof proposal.signature !== "string") throw new SurveyServiceError("پیشنهاد هوش مصنوعی معتبر نیست.");
  assertSignature(proposal); const survey = await loadAuthorized(proposal.surveyId, input.actorUserId); if (snapshotOf(survey.questions) !== proposal.snapshot) throw new SurveyServiceError("پیش‌نویس تغییر کرده است؛ لطفاً صفحه را تازه کنید.");
  const accepted = new Set(input.acceptedOperations ?? input.proposal.operations.map((_, i) => i)); const removes = new Set(input.removeOperationIndexes ?? []); if (removes.size && !input.confirmRemovals) throw new SurveyServiceError("برای حذف باید تأیید جداگانه انجام شود.");
  const operations = proposal.operations.filter((_, i) => accepted.has(i) && (proposal.operations[i].op !== "remove" || removes.has(i)));
  return db.$transaction(async (tx) => {
    const fresh = await tx.survey.findUnique({ where: { id: proposal.surveyId }, select: { state: true, ownerId: true } });
    if (!fresh || fresh.state !== SurveyState.DRAFT) throw new SurveyServiceError("هوش مصنوعی فقط روی پیش‌نویس کار می‌کند.");
    for (const op of operations) {
      if (op.op === "add") {
        const sortOrder = await tx.surveyQuestion.count({ where: { surveyId: proposal.surveyId } });
        const created = await tx.surveyQuestion.create({ data: { surveyId: proposal.surveyId, prompt: op.question.prompt, helpText: op.question.helpText ?? null, type: op.question.type, required: op.question.required ?? false, sortOrder, ratingMin: op.question.type === SurveyQuestionType.RATING ? (op.question.ratingMin ?? 1) : null, ratingMax: op.question.type === SurveyQuestionType.RATING ? (op.question.ratingMax ?? 5) : null, maxSelections: op.question.type === SurveyQuestionType.MULTIPLE_CHOICE ? (op.question.maxSelections ?? null) : null } });
        for (const [index, option] of (op.question.options ?? []).entries()) await tx.surveyOption.create({ data: { questionId: created.id, label: option.label, sortOrder: index } });
      } else {
        const question = await tx.surveyQuestion.findUnique({ where: { id: op.questionId }, select: { id: true, surveyId: true, prompt: true, helpText: true, type: true, required: true, options: { select: { id: true, label: true }, orderBy: { sortOrder: "asc" } } } });
        if (!question || question.surveyId !== proposal.surveyId) throw new SurveyServiceError("شناسه سؤال پیشنهادی معتبر نیست.");
        const expected = op.before; if (op.op === "replace" && (question.prompt !== expected.prompt || question.helpText !== (expected.helpText ?? null) || question.type !== expected.type || question.required !== (expected.required ?? false))) throw new SurveyServiceError("پیش‌نویس تغییر کرده است؛ لطفاً صفحه را تازه کنید.");
        if (op.op === "remove") await tx.surveyQuestion.delete({ where: { id: op.questionId } });
        else { await tx.surveyQuestion.update({ where: { id: op.questionId }, data: { prompt: op.after.prompt, helpText: op.after.helpText ?? null, type: op.after.type, required: op.after.required ?? false, ratingMin: op.after.type === SurveyQuestionType.RATING ? (op.after.ratingMin ?? 1) : null, ratingMax: op.after.type === SurveyQuestionType.RATING ? (op.after.ratingMax ?? 5) : null, maxSelections: op.after.type === SurveyQuestionType.MULTIPLE_CHOICE ? (op.after.maxSelections ?? null) : null } }); if (op.after.options) { const ids = new Set(question.options.map((o) => o.id)); if (op.after.options.some((o) => !o.id || !ids.has(o.id))) throw new SurveyServiceError("شناسه گزینه پیشنهادی معتبر نیست."); await Promise.all(op.after.options.map((o, index) => tx.surveyOption.update({ where: { id: o.id }, data: { label: o.label, sortOrder: index } }))); } }
      }
    }
    await tx.auditLog.create({ data: { actorUserId: input.actorUserId, entityType: "Survey", entityId: proposal.surveyId, action: "SURVEY_AI_APPLIED", newValue: { operationCount: operations.length } } });
    return { applied: operations.length };
  });
}
