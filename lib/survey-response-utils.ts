export type SurveyQuestionTypeName = "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "RATING";
export type SurveyConditionOperatorName = "IS_SELECTED" | "IS_NOT_SELECTED";

export type AnswerValue = string | string[] | number | null;

export type QuestionCondition = {
  sourceQuestionId: string;
  sourceOptionId: string;
  operator: SurveyConditionOperatorName;
} | null;

export type QuestionWithCondition = {
  id: string;
  type: SurveyQuestionTypeName;
  required: boolean;
  condition: QuestionCondition;
};

/**
 * Determine which questions are visible based on current answers and conditions.
 *
 * A question is visible if:
 * - It has no condition, OR
 * - Its condition is met AND its source question is also visible.
 *
 * A condition is met when:
 * - IS_SELECTED: the source question answer includes the source option ID.
 * - IS_NOT_SELECTED: the source question answer does not include the source option ID.
 *
 * This is a pure function — no database or React dependency.
 */
export function getVisibleQuestionIds(
  questions: QuestionWithCondition[],
  answers: Record<string, AnswerValue>,
): Set<string> {
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const visible = new Set<string>();

  function computeVisible(questionId: string): boolean {
    if (visible.has(questionId)) return true;

    const question = questionMap.get(questionId);
    if (!question) return false;

    if (!question.condition) {
      visible.add(questionId);
      return true;
    }

    // Source question must be visible
    if (!computeVisible(question.condition.sourceQuestionId)) {
      return false;
    }

    const sourceAnswer = answers[question.condition.sourceQuestionId];
    const met = checkCondition(sourceAnswer, question.condition);
    if (met) {
      visible.add(questionId);
      return true;
    }

    return false;
  }

  for (const question of questions) {
    computeVisible(question.id);
  }

  return visible;
}

function checkCondition(
  answer: AnswerValue,
  condition: { sourceOptionId: string; operator: SurveyConditionOperatorName },
): boolean {
  if (answer === null || answer === undefined) {
    return condition.operator === "IS_NOT_SELECTED";
  }

  const isSelected = condition.operator === "IS_SELECTED";

  if (typeof answer === "string") {
    return isSelected ? answer === condition.sourceOptionId : answer !== condition.sourceOptionId;
  }

  if (Array.isArray(answer)) {
    const hasOption = answer.includes(condition.sourceOptionId);
    return isSelected ? hasOption : !hasOption;
  }

  // Numeric answers (rating) cannot be condition sources
  return false;
}

/**
 * Remove answers whose questions are hidden by visibility conditions.
 * Returns a new answers object without the hidden entries.
 *
 * This is a pure function.
 */
export function clearHiddenAnswers(
  questions: QuestionWithCondition[],
  answers: Record<string, AnswerValue>,
): Record<string, AnswerValue> {
  const visible = getVisibleQuestionIds(questions, answers);
  const result: Record<string, AnswerValue> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (visible.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Parse a raw FormData value into an AnswerValue for the given question type.
 * Returns null for empty/missing values.
 *
 * This is a pure function.
 */
export function parseAnswerValue(
  raw: FormDataEntryValue | null,
  questionType: SurveyQuestionTypeName,
  existing: AnswerValue,
): AnswerValue {
  if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return null;
  }

  const value = typeof raw === "string" ? raw.trim() : String(raw);

  switch (questionType) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return value;
    case "SINGLE_CHOICE":
      return value;
    case "MULTIPLE_CHOICE": {
      const current = Array.isArray(existing) ? existing : [];
      if (current.includes(value)) {
        return current.filter((v) => v !== value);
      }
      return [...current, value];
    }
    case "RATING": {
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    }
  }
}
