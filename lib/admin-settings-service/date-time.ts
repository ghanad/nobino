const ONE_HOUR_MS = 60 * 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):00$/;

type ErrorFactory = (message: string) => Error;

export function assertTime(
  value: string,
  fieldName: string,
  createError: ErrorFactory,
): void {
  if (!TIME_PATTERN.test(value)) {
    throw createError(`${fieldName} must be an exact hour like 09:00.`);
  }
}

export function assertWorkingHours(
  input: {
    isWorkingDay: boolean;
    startTime?: string | null;
    endTime?: string | null;
  },
  createError: ErrorFactory,
): { startTime: string | null; endTime: string | null } {
  if (!input.isWorkingDay) {
    return { startTime: null, endTime: null };
  }

  if (!input.startTime || !input.endTime) {
    throw createError("Working days need start and end hours.");
  }

  assertTime(input.startTime, "Start time", createError);
  assertTime(input.endTime, "End time", createError);

  if (input.endTime <= input.startTime) {
    throw createError("End time must be after start time.");
  }

  return {
    startTime: input.startTime,
    endTime: input.endTime,
  };
}

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

export function buildHourlySlots(startAt: Date, endAt: Date) {
  const slots: Array<{ slotStart: Date; slotEnd: Date }> = [];

  for (
    let slotStartMs = startAt.getTime();
    slotStartMs < endAt.getTime();
    slotStartMs += ONE_HOUR_MS
  ) {
    slots.push({
      slotStart: new Date(slotStartMs),
      slotEnd: new Date(slotStartMs + ONE_HOUR_MS),
    });
  }

  return slots;
}
