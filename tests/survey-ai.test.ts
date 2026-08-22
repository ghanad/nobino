import assert from "node:assert/strict";
import test from "node:test";

import { SurveyQuestionType } from "@prisma/client";
import {
  applySurveyAiRequestSchema,
  signedSurveyAiProposalSchema,
  normalizeSurveyAiModelOutput,
  surveyAiProposalSchema,
  validateSurveyAiOperationScope,
  validateSurveyAiReplaceScope,
} from "../lib/survey-ai-service";
import { mergeSurveyAiReplaceAfter, surveyAiReplaceFieldKeys } from "../lib/survey-ai-fields";
import { rejectCrossSiteWrite } from "../lib/csrf";

const base = {
  surveyId: "survey-1",
  snapshot: "snapshot",
  signature: "a".repeat(64),
  kind: "suggest" as const,
  operations: [{ op: "add" as const, question: { prompt: "سؤال", type: SurveyQuestionType.SHORT_TEXT } }],
  diagnostics: [],
};

test("survey AI apply schema accepts signed proposals with explicit operation indexes", () => {
  const parsed = applySurveyAiRequestSchema.safeParse({ proposal: base, acceptedOperations: [0], removeOperationIndexes: [], confirmRemovals: false });
  assert.equal(parsed.success, true);
});

test("survey AI apply schema rejects forbidden or malformed transport fields", () => {
  assert.equal(applySurveyAiRequestSchema.safeParse({ proposal: base, csrfToken: "ignored" }).success, false);
  assert.equal(applySurveyAiRequestSchema.safeParse({ proposal: base, acceptedOperations: [1] }).success, true);
  assert.equal(applySurveyAiRequestSchema.safeParse({ proposal: base, acceptedOperations: [0, 0] }).success, false);
  assert.equal(signedSurveyAiProposalSchema.safeParse({ ...base, signature: "not-a-signature" }).success, false);
});

test("survey AI apply schema validates per-field replace selections", () => {
  const withSelection = { proposal: base, replaceFieldSelections: [{ operationIndex: 0, fields: ["prompt", "option:o1"] }] };
  assert.equal(applySurveyAiRequestSchema.safeParse(withSelection).success, true);
  assert.equal(applySurveyAiRequestSchema.safeParse({ ...withSelection, replaceFieldSelections: [] }).success, true);
  assert.equal(applySurveyAiRequestSchema.safeParse({ proposal: base, replaceFieldSelections: [{ operationIndex: 0, fields: [] }] }).success, false);
  assert.equal(applySurveyAiRequestSchema.safeParse({ proposal: base, replaceFieldSelections: [{ operationIndex: 0, fields: ["prompt", "prompt"] }] }).success, false);
  assert.equal(applySurveyAiRequestSchema.safeParse({ proposal: base, replaceFieldSelections: [{ operationIndex: 0, fields: ["type"] }] }).success, false);
  assert.equal(applySurveyAiRequestSchema.safeParse({ proposal: base, replaceFieldSelections: [{ operationIndex: 0, fields: ["prompt"] }, { operationIndex: 0, fields: ["helpText"] }] }).success, false);
});

test("survey AI replace field keys detect only prompt, help text, and option label diffs", () => {
  const before = {
    id: "q1",
    prompt: "متن فعلی",
    helpText: "راهنمای فعلی",
    type: SurveyQuestionType.SINGLE_CHOICE,
    options: [{ id: "o1", label: "اول" }, { id: "o2", label: "دوم" }],
  };
  const after = {
    ...before,
    prompt: "متن پیشنهادی",
    options: [{ id: "o1", label: "اول" }, { id: "o2", label: "دومِ بهتر" }],
  };

  assert.deepEqual(surveyAiReplaceFieldKeys(before, after), ["prompt", "option:o2"]);
  assert.deepEqual(surveyAiReplaceFieldKeys(after, after), []);
  assert.deepEqual(surveyAiReplaceFieldKeys({ ...before, helpText: " راهنمای فعلی " }, after), ["prompt", "option:o2"]);
});

test("survey AI replace field keys always satisfy the apply transport pattern", () => {
  const before = {
    id: "q1",
    prompt: "متن فعلی",
    helpText: null,
    type: SurveyQuestionType.SINGLE_CHOICE,
    options: [{ id: "cmt398oux0001lagmfts4f0hc", label: "اول" }],
  };
  const after = { ...before, prompt: "پیشنهادی", helpText: "راهنما", options: [{ id: "cmt398oux0001lagmfts4f0hc", label: "اولِ جدید" }] };

  for (const key of surveyAiReplaceFieldKeys(before, after)) assert.match(key, /^(prompt|helpText|option:[A-Za-z0-9_-]+)$/);
});

test("merging accepted replace fields keeps rejected suggestions at their current values", () => {
  const before = {
    id: "q1",
    prompt: "متن فعلی",
    helpText: "راهنمای فعلی",
    type: SurveyQuestionType.SINGLE_CHOICE,
    required: true,
    options: [{ id: "o1", label: "اول" }, { id: "o2", label: "دوم" }],
  };
  const after = {
    ...before,
    prompt: "متن پیشنهادی",
    helpText: "راهنمای پیشنهادی",
    options: [{ id: "o1", label: "اول جدید" }, { id: "o2", label: "دوم جدید" }],
  };

  const merged = mergeSurveyAiReplaceAfter(before, after, new Set(["prompt", "option:o1"]));
  assert.equal(merged.prompt, "متن پیشنهادی");
  assert.equal(merged.helpText, "راهنمای فعلی");
  assert.deepEqual(merged.options, [{ id: "o1", label: "اول جدید" }, { id: "o2", label: "دوم" }]);
  assert.equal(mergeSurveyAiReplaceAfter(before, after, new Set()).prompt, before.prompt);

  const fullMerge = mergeSurveyAiReplaceAfter(before, after, new Set(["prompt", "helpText", "option:o1", "option:o2"]));
  assert.deepEqual(fullMerge.options, after.options);
});

test("survey AI signed proposal schema remains strict about proposal fields", () => {
  assert.equal(signedSurveyAiProposalSchema.safeParse({ ...base, modelOutput: "do this" }).success, false);
  assert.equal(signedSurveyAiProposalSchema.safeParse({ ...base, operations: [{ op: "remove", questionId: "q1", before: { prompt: "حذف" }, extra: true }] }).success, false);
});

test("survey AI normalizes safe provider formatting differences before validating", () => {
  const output = normalizeSurveyAiModelOutput({
    operations: [{
      op: "add",
      question: { prompt: "نظر شما چیست؟", type: "short_text", options: null },
    }],
    diagnostics: [],
    providerMetadata: { ignored: true },
  });

  assert.equal(surveyAiProposalSchema.safeParse({ ...(output as object), kind: "suggest" }).success, true);
});

test("question review proposal keeps diagnostics separate from an explicit replacement", () => {
  const before = {
    id: "q1",
    prompt: "آیا از محصول خوب و سریع راضی هستید؟",
    type: SurveyQuestionType.SHORT_TEXT,
    required: false,
  };
  const after = { ...before, prompt: "نظر شما دربارهٔ کیفیت محصول چیست؟" };
  const coreProposal = {
    kind: "question-review" as const,
    operations: [{ op: "replace" as const, questionId: "q1", before, after }],
    diagnostics: [{ severity: "warning" as const, title: "سؤال دوگانه", detail: "دو مفهوم در یک سؤال آمده است.", questionId: "q1" }],
  };
  const proposal = { ...base, ...coreProposal };

  assert.equal(surveyAiProposalSchema.safeParse(coreProposal).success, true);
  assert.equal(signedSurveyAiProposalSchema.safeParse(proposal).success, true);
});

test("question review scope only permits an explicit replacement for the stable question ID", () => {
  const replacement = {
    op: "replace" as const,
    questionId: "q1",
    before: { id: "q1", prompt: "فعلی", type: SurveyQuestionType.SHORT_TEXT },
    after: { id: "q1", prompt: "پیشنهادی", type: SurveyQuestionType.SHORT_TEXT },
  };

  assert.doesNotThrow(() => validateSurveyAiOperationScope({ mode: "question-review", questionId: "q1", questionIds: ["q1", "q2"], operations: [replacement] }));
  assert.throws(() => validateSurveyAiOperationScope({ mode: "question-review", questionId: "q1", questionIds: ["q1", "q2"], operations: [{ ...replacement, questionId: "q2", before: { ...replacement.before, id: "q2" }, after: { ...replacement.after, id: "q2" } }] }), /سؤال انتخاب‌شده/);
  assert.throws(() => validateSurveyAiOperationScope({ mode: "review", questionIds: ["q1"], operations: [replacement] }), /فقط باید diagnostic/);
});

test("question replacement scope allows only text, help text, and existing option labels", () => {
  const before = {
    id: "q1",
    prompt: "سؤال فعلی",
    helpText: "راهنمای فعلی",
    type: SurveyQuestionType.MULTIPLE_CHOICE,
    required: true,
    randomizeOptions: true,
    ratingMin: null,
    ratingMax: null,
    ratingMinLabel: null,
    ratingMaxLabel: null,
    maxSelections: 1,
    options: [{ id: "o1", label: "گزینه اول" }, { id: "o2", label: "گزینه دوم" }],
  };
  const allowed = {
    ...before,
    prompt: "سؤال پیشنهادی",
    helpText: "راهنمای پیشنهادی",
    options: [{ id: "o1", label: "گزینهٔ اول جدید" }, { id: "o2", label: "گزینهٔ دوم جدید" }],
  };

  assert.doesNotThrow(() => validateSurveyAiReplaceScope(before, allowed));
  for (const [field, value] of [
    ["type", SurveyQuestionType.SHORT_TEXT],
    ["required", false],
    ["randomizeOptions", false],
    ["maxSelections", 2],
  ] as const) {
    assert.throws(() => validateSurveyAiReplaceScope(before, { ...allowed, [field]: value }), /فقط می‌تواند/);
  }
  assert.throws(() => validateSurveyAiReplaceScope({ ...before, type: SurveyQuestionType.RATING }, { ...allowed, type: SurveyQuestionType.RATING, ratingMin: 0 }), /فقط می‌تواند/);
  assert.throws(() => validateSurveyAiReplaceScope(before, { ...allowed, options: [{ id: "o2", label: "اول" }, { id: "o1", label: "دوم" }] }), /شناسه و تعداد/);
  assert.throws(() => validateSurveyAiReplaceScope(before, { ...allowed, options: [{ id: "o1", label: "فقط یک گزینه" }] }), /شناسه و تعداد/);
});

test("survey AI write CSRF guard rejects cross-site browser metadata", () => {
  assert.equal(rejectCrossSiteWrite(new Request("https://nobino.test/api/survey-ai", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }))?.status, 403);
  assert.equal(rejectCrossSiteWrite(new Request("https://nobino.test/api/survey-ai", { method: "POST", headers: { origin: "https://evil.test" } }))?.status, 403);
  assert.equal(rejectCrossSiteWrite(new Request("https://nobino.test/api/survey-ai", { method: "POST", headers: { origin: "https://nobino.test" } })), null);
});

test("survey AI write CSRF guard honors the configured public origin behind a proxy", () => {
  const previousBaseUrl = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://nobino.example.com";

  try {
    const request = new Request("http://nobino:3000/api/survey-ai", {
      method: "POST",
      headers: { origin: "https://nobino.example.com" },
    });

    assert.equal(rejectCrossSiteWrite(request), null);
  } finally {
    if (previousBaseUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = previousBaseUrl;
  }
});

test("survey AI write CSRF guard honors the public host forwarded by a proxy", () => {
  const request = new Request("http://nobino:3000/api/survey-ai", {
    method: "POST",
    headers: {
      origin: "https://nobino.example.com",
      host: "nobino.example.com",
      "x-forwarded-proto": "https",
    },
  });

  assert.equal(rejectCrossSiteWrite(request), null);
});
