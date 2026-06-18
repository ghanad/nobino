const PERSIAN_HOUR_FORMATTER = new Intl.NumberFormat("fa-IR", {
  minimumIntegerDigits: 2,
  useGrouping: false,
});

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR", {
  useGrouping: false,
});

export function buildDateHref(dateParam: string): string {
  return `?date=${dateParam}`;
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

export function formatPersianNumber(value: number): string {
  return PERSIAN_NUMBER_FORMATTER.format(value);
}
