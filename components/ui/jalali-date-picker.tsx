"use client";

import DatePicker, { type Value } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persianFa from "react-date-object/locales/persian_fa";

import { JALALI_DATE_INPUT_PLACEHOLDER } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

const LATIN_DIGITS = "0123456789";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    const index = persianIndex >= 0 ? persianIndex : ARABIC_DIGITS.indexOf(digit);

    return LATIN_DIGITS[index] ?? digit;
  });
}

type JalaliDatePickerProps = {
  containerClassName?: string;
  disabled?: boolean;
  id?: string;
  inputClassName?: string;
  name: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  value?: Value;
};

export function JalaliDatePicker({
  containerClassName,
  disabled,
  id,
  inputClassName,
  name,
  onValueChange,
  required,
  value,
}: JalaliDatePickerProps) {
  return (
    <DatePicker
      calendar={persian}
      calendarPosition="bottom-right"
      containerClassName={cn("w-full", containerClassName)}
      disabled={disabled}
      editable={false}
      format="YYYY-MM-DD"
      id={id}
      inputClass={cn(
        "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        inputClassName,
      )}
      locale={persianFa}
      name={name}
      onChange={(selectedDate) => {
        onValueChange?.(
          selectedDate
            ? toLatinDigits(selectedDate.format("YYYY-MM-DD"))
            : "",
        );
      }}
      placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
      required={required}
      value={value}
    />
  );
}
