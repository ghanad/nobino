import assert from "node:assert/strict";
import test from "node:test";

import { registerBusinessRuleTestHooks } from "./business-rules-helpers";

registerBusinessRuleTestHooks();

test("option order: disabled randomization preserves sort order", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const options = [
    { id: "c", sortOrder: 2 },
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
  ];
  const order = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-1",
    false,
  );
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("option order: same seed produces same order", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const options = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
    { id: "d", sortOrder: 3 },
    { id: "e", sortOrder: 4 },
  ];

  const order1 = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  const order2 = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  assert.deepEqual(order1, order2);
});

test("option order: same seed ignores caller input order", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const designerOrder = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
    { id: "d", sortOrder: 3 },
  ];
  const reversedInput = [...designerOrder].reverse();

  const order1 = getDeterministicOptionOrder(
    designerOrder,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  const order2 = getDeterministicOptionOrder(
    reversedInput,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  assert.deepEqual(order1, order2);
});

test("option order: different users receive different orders", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const options = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
    { id: "d", sortOrder: 3 },
    { id: "e", sortOrder: 4 },
  ];

  const order1 = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  const order2 = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-2",
    true,
  );
  assert.notDeepEqual(order1, order2);
});

test("option order: different surveys produce different orders", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const options = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
  ];

  const order1 = getDeterministicOptionOrder(
    options,
    "survey-a",
    "question-1",
    "user-1",
    true,
  );
  const order2 = getDeterministicOptionOrder(
    options,
    "survey-b",
    "question-1",
    "user-1",
    true,
  );
  assert.notDeepEqual(order1, order2);
});

test("option order: output contains all options exactly once", async () => {
  const { getDeterministicOptionOrder } = await import(
    "@/lib/survey-service/option-order"
  );

  const options = [
    { id: "x", sortOrder: 0 },
    { id: "y", sortOrder: 1 },
    { id: "z", sortOrder: 2 },
  ];
  const order = getDeterministicOptionOrder(
    options,
    "survey-1",
    "question-1",
    "user-1",
    true,
  );
  assert.equal(order.length, 3);
  assert.deepEqual(new Set(order), new Set(["x", "y", "z"]));
});

// ──────────────────────────────────────────────
// Lifecycle: publish
// ──────────────────────────────────────────────

