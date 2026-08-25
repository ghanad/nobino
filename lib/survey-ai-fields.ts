/**
 * Shared logic for per-field acceptance of AI rewrite proposals. Used by the
 * server (authoritative merge during apply) and the client (local preview and
 * state sync), so both sides stay consistent about what a partial accept means.
 */

export type SurveyAiReplaceableQuestion = {
  id?: string;
  prompt: string;
  helpText?: string | null;
  options?: Array<{ id?: string; label: string }>;
};

export const SURVEY_AI_REPLACE_PROMPT_FIELD = "prompt";
export const SURVEY_AI_REPLACE_HELP_TEXT_FIELD = "helpText";

/** Returns the changeable field keys ("prompt", "helpText", "option:<id>") whose values actually differ between before and after. */
export function surveyAiReplaceFieldKeys(before: SurveyAiReplaceableQuestion, after: SurveyAiReplaceableQuestion): string[] {
  const keys: string[] = [];
  if (before.prompt !== after.prompt) keys.push(SURVEY_AI_REPLACE_PROMPT_FIELD);
  if ((before.helpText?.trim() ?? "") !== (after.helpText?.trim() ?? "")) keys.push(SURVEY_AI_REPLACE_HELP_TEXT_FIELD);
  const beforeOptions = before.options ?? [];
  for (const option of after.options ?? []) {
    if (!option.id) continue;
    const previous = beforeOptions.find((candidate) => candidate.id === option.id);
    if (previous && previous.label !== option.label) keys.push(`option:${option.id}`);
  }
  return keys;
}

/** Builds the effective question by taking every field from `before` except the accepted fields, which come from `after`. */
export function mergeSurveyAiReplaceAfter<T extends SurveyAiReplaceableQuestion>(
  before: T,
  after: T,
  acceptedFields: ReadonlySet<string>,
): T {
  return {
    ...before,
    id: after.id ?? before.id,
    prompt: acceptedFields.has(SURVEY_AI_REPLACE_PROMPT_FIELD) ? after.prompt : before.prompt,
    helpText: acceptedFields.has(SURVEY_AI_REPLACE_HELP_TEXT_FIELD) ? after.helpText ?? before.helpText : before.helpText,
    options: before.options?.map((option) => {
      const suggested = after.options?.find((candidate) => candidate.id === option.id);
      return suggested && acceptedFields.has(`option:${option.id}`) ? { ...option, label: suggested.label } : option;
    }) ?? after.options,
  };
}
