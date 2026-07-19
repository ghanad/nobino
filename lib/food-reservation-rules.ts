export const BREAKFAST_PROMPT_END_HOUR = 12;

export function shouldOfferBreakfastForStart(startAt: Date): boolean {
  return startAt.getHours() < BREAKFAST_PROMPT_END_HOUR;
}
