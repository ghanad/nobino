"use client";

const PERSIAN_HOUR_FORMATTER = new Intl.NumberFormat("fa-IR", {
  minimumIntegerDigits: 2,
  useGrouping: false,
});

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR", {
  useGrouping: false,
});

export function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

export function formatPersianHour(hour: number): string {
  return `${PERSIAN_HOUR_FORMATTER.format(hour)}:۰۰`;
}

export function formatPersianShortHour(hour: number): string {
  return PERSIAN_HOUR_FORMATTER.format(hour);
}

export function formatPersianShortHourRange(
  startHour: number,
  endHour: number,
): string {
  return `${formatPersianShortHour(startHour)}–${formatPersianShortHour(endHour)}`;
}

export function formatPersianHourRangeTooltip(
  startHour: number,
  endHour: number,
): string {
  return `از ${formatPersianHour(startHour)} تا ${formatPersianHour(endHour)}`;
}

export function formatPersianHourRangeAriaLabel(
  startHour: number,
  endHour: number,
): string {
  return `از ساعت ${formatPersianHour(startHour)} تا ${formatPersianHour(endHour)}`;
}

export function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}

export function buildDateHref(dateParam: string): string {
  return `?date=${dateParam}`;
}
