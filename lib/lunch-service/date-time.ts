import "server-only";

import { LunchReservationError } from "./shared";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

export function addDays(date: Date, days: number): Date {
  const day = startOfLocalDay(date);

  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

export function assertTime(value: string): void {
  if (!TIME_PATTERN.test(value)) {
    throw new LunchReservationError("زمان باید با قالب HH:mm وارد شود.");
  }
}

function parseTime(value: string): { hour: number; minute: number } {
  assertTime(value);
  const [hour, minute] = value.split(":").map(Number);

  return { hour, minute };
}

export function buildCutoffAt(date: Date, cutoffTime: string): Date {
  const { hour, minute } = parseTime(cutoffTime);
  const previousDay = addDays(date, -1);

  return new Date(
    previousDay.getFullYear(),
    previousDay.getMonth(),
    previousDay.getDate(),
    hour,
    minute,
    0,
    0,
  );
}
