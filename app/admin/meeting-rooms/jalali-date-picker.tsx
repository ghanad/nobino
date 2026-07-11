"use client";

import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

type JalaliDatePickerProps = {
  defaultValue: string;
  inputClassName: string;
  name: string;
  placeholder: string;
};

export function JalaliDatePicker({
  defaultValue,
  inputClassName,
  name,
  placeholder,
}: JalaliDatePickerProps) {
  return (
    <DatePicker
      calendar={persian}
      calendarPosition="bottom-start"
      format="YYYY-MM-DD"
      inputClass={inputClassName}
      locale={persian_fa}
      name={name}
      placeholder={placeholder}
      value={defaultValue}
    />
  );
}
