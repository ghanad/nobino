"use client";

import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persianFa from "react-date-object/locales/persian_fa";

import { JALALI_DATE_INPUT_PLACEHOLDER } from "@/lib/jalali-date";

export function JalaliDatePicker({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  return (
    <DatePicker
      calendar={persian}
      calendarPosition="bottom-right"
      editable={false}
      format="YYYY-MM-DD"
      id={id}
      inputClass="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      locale={persianFa}
      name={name}
      placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
      required
      containerClassName="w-full"
    />
  );
}
