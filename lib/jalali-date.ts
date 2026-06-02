const JALALI_PARAM_FORMATTER = new Intl.DateTimeFormat(
  "fa-IR-u-ca-persian-nu-latn",
  {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  },
);

const JALALI_DATE_FORMATTER = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  day: "numeric",
  month: "long",
  weekday: "long",
  year: "numeric",
});

const JALALI_DATE_WITHOUT_WEEKDAY_FORMATTER = new Intl.DateTimeFormat(
  "fa-IR-u-ca-persian",
  {
    day: "numeric",
    month: "long",
    year: "numeric",
  },
);

const JALALI_DATE_WITHOUT_YEAR_FORMATTER = new Intl.DateTimeFormat(
  "fa-IR-u-ca-persian",
  {
    day: "numeric",
    month: "long",
    weekday: "long",
  },
);

const TIME_FORMATTER = new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
});

const DISPLAY_TIME_FORMATTER = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
});

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const WEEKDAY_LABELS: Record<string, string> = {
  یکشنبه: "یک شنبه",
  دوشنبه: "دو شنبه",
  سه‌شنبه: "سه شنبه",
  سهشنبه: "سه شنبه",
  چهارشنبه: "چهار شنبه",
  پنجشنبه: "پنج شنبه",
};

export const JALALI_DATE_INPUT_PLACEHOLDER = "1405-02-31";

type JalaliParts = {
  year: number;
  month: number;
  day: number;
};

function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);

    if (persianIndex >= 0) {
      return persianIndex.toString();
    }

    return ARABIC_DIGITS.indexOf(digit).toString();
  });
}

function getJalaliParts(date: Date): JalaliParts {
  const parts = JALALI_PARAM_FORMATTER.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return { year, month, day };
}

function sameJalaliDate(date: Date, parts: JalaliParts): boolean {
  const actual = getJalaliParts(date);

  return (
    actual.year === parts.year &&
    actual.month === parts.month &&
    actual.day === parts.day
  );
}

export function formatJalaliDateParam(date: Date): string {
  const { year, month, day } = getJalaliParts(date);

  return [
    year.toString().padStart(4, "0"),
    month.toString().padStart(2, "0"),
    day.toString().padStart(2, "0"),
  ].join("-");
}

export function formatJalaliDate(date: Date): string {
  return formatNaturalDateParts(JALALI_DATE_FORMATTER.formatToParts(date), true);
}

export function formatJalaliDateWithoutWeekday(date: Date): string {
  return formatNaturalDateParts(
    JALALI_DATE_WITHOUT_WEEKDAY_FORMATTER.formatToParts(date),
    false,
  );
}

export function formatJalaliDateWithoutYear(date: Date): string {
  return formatNaturalDateParts(
    JALALI_DATE_WITHOUT_YEAR_FORMATTER.formatToParts(date),
    true,
  );
}

export function formatJalaliDateTime(date: Date): string {
  return `${formatJalaliDate(date)}، ${DISPLAY_TIME_FORMATTER.format(date)}`;
}

export function formatLocalTime(date: Date): string {
  return TIME_FORMATTER.format(date);
}

export function formatPersianLocalTime(date: Date): string {
  return DISPLAY_TIME_FORMATTER.format(date);
}

export function parseJalaliDateParam(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeDigits(value.trim()).replace(/\//g, "-");
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);

  if (!match) {
    return null;
  }

  const requested = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };

  if (
    requested.year < 1300 ||
    requested.year > 1600 ||
    requested.month < 1 ||
    requested.month > 12 ||
    requested.day < 1 ||
    requested.day > 31
  ) {
    return null;
  }

  const searchStart = new Date(requested.year + 621, 0, 1, 0, 0, 0, 0);
  const searchEnd = new Date(requested.year + 622, 3, 15, 0, 0, 0, 0);

  for (
    let candidate = searchStart;
    candidate < searchEnd;
    candidate = new Date(
      candidate.getFullYear(),
      candidate.getMonth(),
      candidate.getDate() + 1,
      0,
      0,
      0,
      0,
    )
  ) {
    if (sameJalaliDate(candidate, requested)) {
      return candidate;
    }
  }

  return null;
}

function formatNaturalDateParts(
  parts: Intl.DateTimeFormatPart[],
  includeWeekday: boolean,
): string {
  const rawWeekday = parts.find((part) => part.type === "weekday")?.value;
  const weekday = rawWeekday ? WEEKDAY_LABELS[rawWeekday] ?? rawWeekday : null;
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;

  return [
    includeWeekday ? weekday : null,
    day,
    month,
    year,
  ].filter(Boolean).join(" ");
}

export function isValidJalaliDateParam(value: string | undefined): value is string {
  return parseJalaliDateParam(value) !== null;
}

export function buildLocalDateAtHourFromJalali(
  dateValue: string,
  hour: number,
): Date {
  const date = parseJalaliDateParam(dateValue);

  if (!date) {
    throw new Error("Invalid Jalali date.");
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    0,
    0,
    0,
  );
}
