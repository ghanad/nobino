import assert from "node:assert/strict";
import test from "node:test";

import { registerBusinessRuleTestHooks } from "./business-rules-helpers";

registerBusinessRuleTestHooks();

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

import type { AnswerValue, QuestionWithCondition } from "@/lib/survey-response-utils";

function makeQuestion(
  id: string,
  required: boolean,
  condition: QuestionWithCondition["condition"] = null,
): QuestionWithCondition {
  return { id, type: "SHORT_TEXT", required, condition };
}

function makeChoiceQuestion(
  id: string,
  required: boolean,
  condition: QuestionWithCondition["condition"] = null,
): QuestionWithCondition {
  return { id, type: "SINGLE_CHOICE", required, condition };
}

// ──────────────────────────────────────────────
// getVisibleQuestionIds
// ──────────────────────────────────────────────

test("visibility: all questions visible when no conditions", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [makeQuestion("q1", false), makeQuestion("q2", true)];
  const visible = getVisibleQuestionIds(questions, {});
  assert.equal(visible.size, 2);
  assert.ok(visible.has("q1"));
  assert.ok(visible.has("q2"));
});

test("visibility: question with satisfied IS_SELECTED condition is visible", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    makeChoiceQuestion("source", false),
    makeQuestion("target", false, {
      sourceQuestionId: "source",
      sourceOptionId: "opt-a",
      operator: "IS_SELECTED",
    }),
  ];
  const visible = getVisibleQuestionIds(questions, { source: "opt-a" });
  assert.equal(visible.size, 2);
  assert.ok(visible.has("target"));
});

test("visibility: question with unsatisfied IS_SELECTED condition is hidden", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    makeChoiceQuestion("source", false),
    makeQuestion("target", false, {
      sourceQuestionId: "source",
      sourceOptionId: "opt-a",
      operator: "IS_SELECTED",
    }),
  ];
  const visible = getVisibleQuestionIds(questions, { source: "opt-b" });
  assert.equal(visible.size, 1);
  assert.ok(visible.has("source"));
  assert.ok(!visible.has("target"));
});

test("visibility: IS_NOT_SELECTED condition is satisfied when option is not selected", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    makeChoiceQuestion("source", false),
    makeQuestion("target", false, {
      sourceQuestionId: "source",
      sourceOptionId: "opt-a",
      operator: "IS_NOT_SELECTED",
    }),
  ];
  const visible = getVisibleQuestionIds(questions, { source: "opt-b" });
  assert.equal(visible.size, 2);
  assert.ok(visible.has("target"));
});

test("visibility: IS_NOT_SELECTED condition is not satisfied when option is selected", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    makeChoiceQuestion("source", false),
    makeQuestion("target", false, {
      sourceQuestionId: "source",
      sourceOptionId: "opt-a",
      operator: "IS_NOT_SELECTED",
    }),
  ];
  const visible = getVisibleQuestionIds(questions, { source: "opt-a" });
  assert.equal(visible.size, 1);
  assert.ok(!visible.has("target"));
});

test("visibility: IS_NOT_SELECTED is satisfied when source has no answer", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    makeChoiceQuestion("source", false),
    makeQuestion("target", false, {
      sourceQuestionId: "source",
      sourceOptionId: "opt-a",
      operator: "IS_NOT_SELECTED",
    }),
  ];
  const visible = getVisibleQuestionIds(questions, {});
  assert.equal(visible.size, 2);
  assert.ok(visible.has("target"));
});

test("visibility: chained conditions are computed recursively", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    makeChoiceQuestion("q1", false),
    makeQuestion("q2", false, {
      sourceQuestionId: "q1",
      sourceOptionId: "opt-a",
      operator: "IS_SELECTED",
    }),
    makeQuestion("q3", false, {
      sourceQuestionId: "q2",
      sourceOptionId: "opt-b",
      operator: "IS_SELECTED",
    }),
  ];
  // q1 has no answer, so q2 is hidden, so q3 is also hidden
  const visible = getVisibleQuestionIds(questions, {});
  assert.equal(visible.size, 1);
  assert.ok(visible.has("q1"));
  assert.ok(!visible.has("q2"));
  assert.ok(!visible.has("q3"));
});

test("visibility: hidden source hides dependent questions", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    makeChoiceQuestion("q1", false),
    makeQuestion("q2", false, {
      sourceQuestionId: "q1",
      sourceOptionId: "opt-a",
      operator: "IS_SELECTED",
    }),
    makeQuestion("q3", false, {
      sourceQuestionId: "q2",
      sourceOptionId: "opt-b",
      operator: "IS_SELECTED",
    }),
  ];
  // q1 has opt-a selected, so q2 is visible. But q2 is not a choice question
  // and has no answer, so q3's condition (IS_SELECTED on q2) is not satisfied.
  const visible = getVisibleQuestionIds(questions, { q1: "opt-a" });
  assert.equal(visible.size, 2);
  assert.ok(visible.has("q1"));
  assert.ok(visible.has("q2"));
  assert.ok(!visible.has("q3"));
});

test("visibility: multiple choice condition with selected option", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    { id: "source", type: "MULTIPLE_CHOICE" as const, required: false, condition: null },
    makeQuestion("target", false, {
      sourceQuestionId: "source",
      sourceOptionId: "opt-a",
      operator: "IS_SELECTED",
    }),
  ];
  const visible = getVisibleQuestionIds(questions, { source: ["opt-a", "opt-b"] });
  assert.equal(visible.size, 2);
  assert.ok(visible.has("target"));
});

test("visibility: multiple choice condition without selected option", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    { id: "source", type: "MULTIPLE_CHOICE" as const, required: false, condition: null },
    makeQuestion("target", false, {
      sourceQuestionId: "source",
      sourceOptionId: "opt-a",
      operator: "IS_SELECTED",
    }),
  ];
  const visible = getVisibleQuestionIds(questions, { source: ["opt-c"] });
  assert.equal(visible.size, 1);
  assert.ok(!visible.has("target"));
});

// ──────────────────────────────────────────────
// clearHiddenAnswers
// ──────────────────────────────────────────────

test("clearHiddenAnswers: removes answers for hidden questions", async () => {
  const { clearHiddenAnswers } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    makeChoiceQuestion("source", false),
    makeQuestion("target", false, {
      sourceQuestionId: "source",
      sourceOptionId: "opt-a",
      operator: "IS_SELECTED",
    }),
  ];
  const answers: Record<string, AnswerValue> = {
    source: "opt-b",
    target: "some text",
  };
  const cleaned = clearHiddenAnswers(questions, answers);
  assert.deepEqual(cleaned, { source: "opt-b" });
});

test("clearHiddenAnswers: preserves answers for visible questions", async () => {
  const { clearHiddenAnswers } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    makeQuestion("q1", false),
    makeQuestion("q2", true),
  ];
  const answers: Record<string, AnswerValue> = { q1: "a", q2: "b" };
  const cleaned = clearHiddenAnswers(questions, answers);
  assert.deepEqual(cleaned, { q1: "a", q2: "b" });
});

test("clearHiddenAnswers: returns empty object when no answers", async () => {
  const { clearHiddenAnswers } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [makeQuestion("q1", false)];
  const cleaned = clearHiddenAnswers(questions, {});
  assert.deepEqual(cleaned, {});
});

// ──────────────────────────────────────────────
// parseAnswerValue
// ──────────────────────────────────────────────

test("parseAnswerValue: short text returns trimmed string", async () => {
  const { parseAnswerValue } = await import(
    "@/lib/survey-response-utils"
  );

  const result = parseAnswerValue("  hello  ", "SHORT_TEXT", null);
  assert.equal(result, "hello");
});

test("parseAnswerValue: long text returns trimmed string", async () => {
  const { parseAnswerValue } = await import(
    "@/lib/survey-response-utils"
  );

  const result = parseAnswerValue("  long text  ", "LONG_TEXT", null);
  assert.equal(result, "long text");
});

test("parseAnswerValue: empty string returns null", async () => {
  const { parseAnswerValue } = await import(
    "@/lib/survey-response-utils"
  );

  const result = parseAnswerValue("", "SHORT_TEXT", null);
  assert.equal(result, null);
});

test("parseAnswerValue: null returns null", async () => {
  const { parseAnswerValue } = await import(
    "@/lib/survey-response-utils"
  );

  const result = parseAnswerValue(null, "SHORT_TEXT", null);
  assert.equal(result, null);
});

test("parseAnswerValue: single choice returns option ID", async () => {
  const { parseAnswerValue } = await import(
    "@/lib/survey-response-utils"
  );

  const result = parseAnswerValue("opt-1", "SINGLE_CHOICE", null);
  assert.equal(result, "opt-1");
});

test("parseAnswerValue: multiple choice adds to existing array", async () => {
  const { parseAnswerValue } = await import(
    "@/lib/survey-response-utils"
  );

  const result = parseAnswerValue("opt-2", "MULTIPLE_CHOICE", ["opt-1"]);
  assert.deepEqual(result, ["opt-1", "opt-2"]);
});

test("parseAnswerValue: multiple choice removes existing option", async () => {
  const { parseAnswerValue } = await import(
    "@/lib/survey-response-utils"
  );

  const result = parseAnswerValue("opt-1", "MULTIPLE_CHOICE", ["opt-1", "opt-2"]);
  assert.deepEqual(result, ["opt-2"]);
});

test("parseAnswerValue: multiple choice starts empty array", async () => {
  const { parseAnswerValue } = await import(
    "@/lib/survey-response-utils"
  );

  const result = parseAnswerValue("opt-1", "MULTIPLE_CHOICE", null);
  assert.deepEqual(result, ["opt-1"]);
});

test("parseAnswerValue: rating returns valid number", async () => {
  const { parseAnswerValue } = await import(
    "@/lib/survey-response-utils"
  );

  const result = parseAnswerValue("7", "RATING", null);
  assert.equal(result, 7);
});

test("parseAnswerValue: rating with invalid string returns null", async () => {
  const { parseAnswerValue } = await import(
    "@/lib/survey-response-utils"
  );

  const result = parseAnswerValue("abc", "RATING", null);
  assert.equal(result, null);
});

// ──────────────────────────────────────────────
// Malformed / edge-case payloads
// ──────────────────────────────────────────────

test("visibility: unknown source question is treated as invisible", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    makeQuestion("target", false, {
      sourceQuestionId: "nonexistent",
      sourceOptionId: "opt-a",
      operator: "IS_SELECTED",
    }),
  ];
  const visible = getVisibleQuestionIds(questions, {});
  assert.equal(visible.size, 0);
});

test("visibility: condition on rating question is never satisfied", async () => {
  const { getVisibleQuestionIds } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    { id: "rating", type: "RATING" as const, required: false, condition: null },
    makeQuestion("target", false, {
      sourceQuestionId: "rating",
      sourceOptionId: "opt-a",
      operator: "IS_SELECTED",
    }),
  ];
  // Rating answer is numeric, IS_SELECTED on a numeric answer should not match
  const visible = getVisibleQuestionIds(questions, { rating: 5 });
  assert.equal(visible.size, 1);
  assert.ok(visible.has("rating"));
  assert.ok(!visible.has("target"));
});

test("clearHiddenAnswers: hidden required fields are not required", async () => {
  const { clearHiddenAnswers } = await import(
    "@/lib/survey-response-utils"
  );

  const questions = [
    makeChoiceQuestion("source", false),
    makeQuestion("target", true, {
      sourceQuestionId: "source",
      sourceOptionId: "opt-a",
      operator: "IS_SELECTED",
    }),
  ];
  // target is required but hidden because source answer doesn't match
  const answers: Record<string, AnswerValue> = { source: "opt-b" };
  const cleaned = clearHiddenAnswers(questions, answers);
  // target should be removed since it's hidden
  assert.deepEqual(cleaned, { source: "opt-b" });
});
