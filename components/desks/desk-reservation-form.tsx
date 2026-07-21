"use client";

import { useState } from "react";
import { Armchair, CalendarRange, Check, Clock3 } from "lucide-react";

import {
  createDeskReservationAction,
  updateOwnDeskReservationAction,
} from "@/app/desks/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

type DeskOption = {
  id: string;
  name: string;
};

type DeskReservationFormProps = {
  date: string;
  defaultDeskId: string;
  defaultEndHour: number;
  defaultStartHour: number;
  desks: DeskOption[];
  hours: number[];
  isFullDay: boolean;
  isStarted: boolean;
  officeId: string;
  reservationId?: string;
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`.replace(
    /\d/g,
    (digit) => PERSIAN_DIGITS[Number(digit)],
  );
}

export function DeskReservationForm({
  date,
  defaultDeskId,
  defaultEndHour,
  defaultStartHour,
  desks,
  hours,
  isFullDay,
  isStarted,
  officeId,
  reservationId,
}: DeskReservationFormProps) {
  const [fullDay, setFullDay] = useState(isFullDay && !isStarted);
  const [startHour, setStartHour] = useState(defaultStartHour);
  const [endHour, setEndHour] = useState(defaultEndHour);
  const action = reservationId
    ? updateOwnDeskReservationAction
    : createDeskReservationAction;
  const firstHour = hours[0] ?? defaultStartHour;
  const lastHour = hours.at(-1) ?? defaultEndHour;
  const displayedStart = fullDay ? firstHour : startHour;
  const displayedEnd = fullDay ? lastHour : endHour;

  return (
    <form action={action} className="grid gap-0">
      <input name="date" type="hidden" value={date} />
      <input name="officeId" type="hidden" value={officeId} />
      {reservationId ? (
        <input name="reservationId" type="hidden" value={reservationId} />
      ) : null}
      {fullDay ? <input name="fullDay" type="hidden" value="on" /> : null}

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <fieldset className="grid content-start gap-3">
          <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Armchair className="h-4 w-4 text-primary" />
            انتخاب میز
          </legend>
          <p className="text-xs leading-5 text-muted-foreground">
            میزی را که ترجیح می‌دهید انتخاب کنید؛ وضعیت اشغال هر میز در کارت‌های بالا مشخص است.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {desks.map((desk) => (
              <label className="group relative cursor-pointer" key={desk.id}>
                <input
                  className="peer sr-only"
                  defaultChecked={desk.id === defaultDeskId}
                  disabled={isStarted}
                  name="deskId"
                  required
                  type="radio"
                  value={desk.id}
                />
                <span className="flex min-h-14 items-center justify-center rounded-lg border bg-background px-3 text-center text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50/50 peer-checked:border-primary peer-checked:bg-blue-50 peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
                  {desk.name}
                </span>
                <Check className="absolute left-2 top-2 hidden h-3.5 w-3.5 text-primary peer-checked:block" />
              </label>
            ))}
          </div>
          {isStarted ? (
            <input name="deskId" type="hidden" value={defaultDeskId} />
          ) : null}
        </fieldset>

        <div className="grid content-start gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="grid gap-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <CalendarRange className="h-4 w-4 text-primary" />
              مدت حضور
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {isStarted
                ? "رزرو شروع شده؛ فقط می‌توانید ساعت پایان را تغییر دهید."
                : "رزرو ساعتی یا تمام ساعات کاری دفتر را انتخاب کنید."}
            </p>
          </div>

          <div className="grid grid-cols-2 rounded-lg bg-slate-200/70 p-1 text-sm">
            <button
              className={cn(
                "h-9 rounded-md font-medium transition",
                !fullDay ? "bg-white text-slate-950 shadow-sm" : "text-slate-600",
              )}
              onClick={() => setFullDay(false)}
              type="button"
            >
              ساعتی
            </button>
            <button
              className={cn(
                "h-9 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                fullDay ? "bg-white text-slate-950 shadow-sm" : "text-slate-600",
              )}
              disabled={isStarted}
              onClick={() => setFullDay(true)}
              type="button"
            >
              کل روز کاری
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">
              شروع
              <select
                className="h-11 rounded-lg border bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-slate-100"
                disabled={fullDay || isStarted}
                name="startHour"
                onChange={(event) => {
                  const nextStart = Number(event.target.value);
                  setStartHour(nextStart);
                  if (endHour <= nextStart) setEndHour(nextStart + 1);
                }}
                value={startHour}
              >
                {hours.slice(0, -1).map((hour) => (
                  <option key={hour} value={hour}>{formatHour(hour)}</option>
                ))}
              </select>
              {fullDay || isStarted ? (
                <input name="startHour" type="hidden" value={displayedStart} />
              ) : null}
            </label>
            <span className="mb-3 h-px w-4 bg-slate-300" />
            <label className="grid gap-1.5 text-xs font-medium text-slate-600">
              پایان
              <select
                className="h-11 rounded-lg border bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-slate-100"
                disabled={fullDay}
                name="endHour"
                onChange={(event) => setEndHour(Number(event.target.value))}
                value={endHour}
              >
                {hours.slice(1).filter((hour) => hour > startHour).map((hour) => (
                  <option key={hour} value={hour}>{formatHour(hour)}</option>
                ))}
              </select>
              {fullDay ? (
                <input name="endHour" type="hidden" value={displayedEnd} />
              ) : null}
            </label>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Clock3 className="h-4 w-4 text-primary" />
          <span>بازه انتخابی:</span>
          <strong className="text-slate-900">
            {formatHour(displayedStart)} تا {formatHour(displayedEnd)}
          </strong>
        </div>
        <SubmitButton className="h-11 min-w-44 px-7" pendingLabel="در حال ثبت">
          <Check className="h-4 w-4" />
          {reservationId ? "ذخیره تغییرات" : "ثبت درخواست رزرو"}
        </SubmitButton>
      </div>
    </form>
  );
}
