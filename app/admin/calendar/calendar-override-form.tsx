"use client";

import { CalendarDayOverrideMode } from "@prisma/client";
import { CalendarClock, CalendarOff, CalendarSync, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  createCalendarDayOverrideAction,
  deleteCalendarDayOverrideAction,
  updateCalendarDayOverrideAction,
} from "@/app/admin/calendar/actions";
import { FieldLabel, TextInput } from "@/app/admin/_components/admin-form-fields";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

type TargetOption = { id: string; name: string };

type CalendarOverrideFormProps = {
  initial?: {
    endTime: string | null;
    lunch: boolean;
    mode: CalendarDayOverrideMode;
    officeIds: string[];
    overrideId: string;
    reason: string | null;
    roomIds: string[];
    startTime: string | null;
    systems: boolean;
  };
  offices: TargetOption[];
  rooms: TargetOption[];
};

const MODE_OPTIONS = [
  {
    description: "سرویس‌های انتخاب‌شده در این تاریخ غیرفعال می‌شوند.",
    icon: CalendarOff,
    label: "تعطیل",
    value: CalendarDayOverrideMode.CLOSED,
  },
  {
    description: "تعطیلی رسمی نادیده گرفته و برنامه هفتگی اجرا می‌شود.",
    icon: CalendarSync,
    label: "روز عادی",
    value: CalendarDayOverrideMode.NORMAL,
  },
  {
    description: "سرویس‌ها با ساعت شروع و پایان مشخص فعال می‌شوند.",
    icon: CalendarClock,
    label: "برنامه ویژه",
    value: CalendarDayOverrideMode.CUSTOM,
  },
] as const;

function TargetCheckbox({
  checked,
  label,
  name,
  onChange,
  value,
}: {
  checked: boolean;
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
  value?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm transition-colors hover:bg-slate-50">
      <input
        checked={checked}
        className="h-4 w-4 rounded border-input"
        name={name}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
        value={value}
      />
      <span>{label}</span>
    </label>
  );
}

function TargetGroup({
  name,
  onChange,
  options,
  selected,
  title,
}: {
  name: string;
  onChange: (ids: string[]) => void;
  options: TargetOption[];
  selected: string[];
  title: string;
}) {
  const allSelected = options.length > 0 && selected.length === options.length;

  return (
    <fieldset className="min-w-0 border-t pt-3 sm:border-r sm:border-t-0 sm:pr-4 sm:pt-0">
      <legend className="mb-1 flex w-full items-center justify-between gap-3 text-sm font-medium">
        <span>{title}</span>
        {options.length ? (
          <button
            className="text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChange(allSelected ? [] : options.map(({ id }) => id))}
            type="button"
          >
            {allSelected ? "لغو انتخاب همه" : "انتخاب همه"}
          </button>
        ) : null}
      </legend>
      {options.length ? (
        <div className="max-h-36 overflow-y-auto">
          {options.map((option) => (
            <TargetCheckbox
              checked={selected.includes(option.id)}
              key={option.id}
              label={option.name}
              name={name}
              onChange={(checked) =>
                onChange(
                  checked
                    ? [...selected, option.id]
                    : selected.filter((id) => id !== option.id),
                )
              }
              value={option.id}
            />
          ))}
        </div>
      ) : (
        <p className="py-2 text-xs text-muted-foreground">مورد فعالی وجود ندارد.</p>
      )}
    </fieldset>
  );
}

export function CalendarOverrideForm({
  initial,
  offices,
  rooms,
}: CalendarOverrideFormProps) {
  const [mode, setMode] = useState(
    initial?.mode ?? CalendarDayOverrideMode.CLOSED,
  );
  const [systems, setSystems] = useState(initial?.systems ?? true);
  const [lunch, setLunch] = useState(initial?.lunch ?? true);
  const [officeIds, setOfficeIds] = useState(
    initial?.officeIds ?? offices.map(({ id }) => id),
  );
  const [roomIds, setRoomIds] = useState(
    initial?.roomIds ?? rooms.map(({ id }) => id),
  );
  const targetCount = useMemo(
    () => Number(systems) + Number(lunch) + officeIds.length + roomIds.length,
    [lunch, officeIds.length, roomIds.length, systems],
  );
  const hasTimedTarget = systems || officeIds.length > 0 || roomIds.length > 0;
  const isEditing = Boolean(initial);

  return (
    <form
      action={
        isEditing
          ? updateCalendarDayOverrideAction
          : createCalendarDayOverrideAction
      }
      className="grid gap-5"
    >
      {initial ? (
        <input name="overrideId" type="hidden" value={initial.overrideId} />
      ) : (
        <div className="grid max-w-xs gap-2">
          <FieldLabel htmlFor="calendar-override-date">تاریخ جلالی</FieldLabel>
          <JalaliDatePicker
            id="calendar-override-date"
            name="date"
            required
          />
        </div>
      )}

      <fieldset>
        <legend className="mb-3 text-sm font-medium">رفتار این تاریخ</legend>
        <div className="grid gap-2 lg:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = mode === option.value;

            return (
              <label
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring",
                  selected
                    ? "border-primary bg-blue-50/60 text-blue-950"
                    : "border-slate-200 bg-white hover:bg-slate-50",
                )}
                key={option.value}
              >
                <input
                  checked={selected}
                  className="sr-only"
                  name="mode"
                  onChange={() => setMode(option.value)}
                  type="radio"
                  value={option.value}
                />
                <Icon
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    selected ? "text-primary" : "text-slate-500",
                  )}
                />
                <span className="grid gap-1">
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span
                    className={cn(
                      "text-xs leading-5",
                      selected ? "text-blue-900/80" : "text-muted-foreground",
                    )}
                  >
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {mode === CalendarDayOverrideMode.CUSTOM && hasTimedTarget ? (
        <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <FieldLabel htmlFor={`override-start-${initial?.overrideId ?? "new"}`}>
              ساعت شروع
            </FieldLabel>
            <TextInput
              defaultValue={initial?.startTime ?? ""}
              id={`override-start-${initial?.overrideId ?? "new"}`}
              name="startTime"
              pattern="([01]\d|2[0-3]):00"
              placeholder="09:00"
              required
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor={`override-end-${initial?.overrideId ?? "new"}`}>
              ساعت پایان
            </FieldLabel>
            <TextInput
              defaultValue={initial?.endTime ?? ""}
              id={`override-end-${initial?.overrideId ?? "new"}`}
              name="endTime"
              pattern="([01]\d|2[0-3]):00"
              placeholder="17:00"
              required
            />
          </div>
          <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
            این ساعت برای سامانه‌ها، دفترها و اتاق‌های انتخاب‌شده مشترک است؛ غذا فقط فعال می‌شود.
          </p>
        </div>
      ) : null}

      <fieldset className="rounded-lg border p-4">
        <legend className="px-2 text-sm font-medium">سرویس‌های تحت تأثیر</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <TargetCheckbox
              checked={systems}
              label="سامانه‌های شرکتی"
              name="systems"
              onChange={setSystems}
            />
            <TargetCheckbox
              checked={lunch}
              label="رزرو غذا"
              name="lunch"
              onChange={setLunch}
            />
          </div>
          <TargetGroup
            name="officeIds"
            onChange={setOfficeIds}
            options={offices}
            selected={officeIds}
            title="دفترها"
          />
          <TargetGroup
            name="roomIds"
            onChange={setRoomIds}
            options={rooms}
            selected={roomIds}
            title="اتاق‌های جلسه"
          />
        </div>
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground" aria-live="polite">
          {targetCount.toLocaleString("fa-IR")} سرویس یا محل انتخاب شده است.
        </p>
      </fieldset>

      <div className="grid gap-2">
        <FieldLabel htmlFor={`override-reason-${initial?.overrideId ?? "new"}`}>
          دلیل اصلاح
        </FieldLabel>
        <TextInput
          defaultValue={initial?.reason ?? ""}
          id={`override-reason-${initial?.overrideId ?? "new"}`}
          maxLength={200}
          name="reason"
          placeholder="برای مثال: خطای تقویم رسمی یا تعطیلی داخلی شرکت"
        />
      </div>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        {initial ? (
          <Button
            formAction={deleteCalendarDayOverrideAction}
            onClick={(event) => {
              if (!window.confirm("این اصلاح تقویم حذف شود؟")) {
                event.preventDefault();
              }
            }}
            type="submit"
            variant="outline"
          >
            <Trash2 className="h-4 w-4" />
            حذف اصلاح
          </Button>
        ) : (
          <span />
        )}
        <SubmitButton
          disabled={targetCount === 0}
          pendingLabel="در حال ذخیره"
        >
          {initial ? "ذخیره تغییرات" : "ثبت اصلاح تاریخ"}
        </SubmitButton>
      </div>
    </form>
  );
}
