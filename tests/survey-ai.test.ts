import assert from "node:assert/strict";
import test from "node:test";

import { SurveyQuestionType } from "@prisma/client";
import { applySurveyAiRequestSchema, signedSurveyAiProposalSchema } from "../lib/survey-ai-service";
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

test("survey AI signed proposal schema remains strict about proposal fields", () => {
  assert.equal(signedSurveyAiProposalSchema.safeParse({ ...base, modelOutput: "do this" }).success, false);
  assert.equal(signedSurveyAiProposalSchema.safeParse({ ...base, operations: [{ op: "remove", questionId: "q1", before: { prompt: "حذف" }, extra: true }] }).success, false);
});

test("survey AI write CSRF guard rejects cross-site browser metadata", () => {
  assert.equal(rejectCrossSiteWrite(new Request("https://nobino.test/api/survey-ai", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }))?.status, 403);
  assert.equal(rejectCrossSiteWrite(new Request("https://nobino.test/api/survey-ai", { method: "POST", headers: { origin: "https://evil.test" } }))?.status, 403);
  assert.equal(rejectCrossSiteWrite(new Request("https://nobino.test/api/survey-ai", { method: "POST", headers: { origin: "https://nobino.test" } })), null);
});
