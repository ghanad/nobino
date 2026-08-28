"use client";

import { CalendarDayOverrideMode } from "@prisma/client";
import { CalendarClock, CalendarOff, ChevronDown, Info, Trash2 } from "lucide-react";
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
    buildingIds: string[];
    overrideId: string;
    reason: string | null;
    roomIds: string[];
    startTime: string | null;
    systems: boolean;
  };
  buildings: TargetOption[];
  rooms: TargetOption[];
  onCancel?: () => void;
  initialDate?: Date;
};

const MODE_OPTIONS = [
  {
    description: "سرویس‌های تحت تأثیر در این تاریخ غیرفعال می‌شوند.",
    icon: CalendarOff,
    label: "تعطیل",
    value: CalendarDayOverrideMode.CLOSED,
  },
  {
    description: "برنامه هفتگی معمول سرویس‌ها اجرا می‌شود.",
    icon: ChevronDown,
    label: "طبق برنامه هفتگی",
    value: CalendarDayOverrideMode.NORMAL,
  },
  {
    description: "برای این تاریخ ساعت شروع و پایان مشخص می‌شود.",
    icon: CalendarClock,
    label: "ساعات ویژه",
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
    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded px-2 text-sm transition-colors hover:bg-slate-50">
      <input
        checked={checked}
        className="h-4 w-4 rounded border-input"
        name={name}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
        value={value}
      />
      <span className="truncate">{label}</span>
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
    <fieldset className="min-w-0">
      <legend className="mb-1 flex w-full items-center justify-between gap-2 text-sm font-medium">
        <span>{title}</span>
        {options.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {selected.length.toLocaleString("fa-IR")} / {options.length.toLocaleString("fa-IR")}
          </span>
        ) : null}
      </legend>
      {options.length > 0 ? (
        <>
          <div className="max-h-40 overflow-y-auto rounded-md border">
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
          <div className="mt-1 flex gap-2">
            <button
              className="text-xs text-primary underline-offset-4 hover:underline"
              onClick={() => onChange(options.map(({ id }) => id))}
              type="button"
            >
              انتخاب همه
            </button>
            <button
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => onChange([])}
              type="button"
            >
              حذف همه
            </button>
          </div>
        </>
      ) : (
        <p className="py-2 text-xs text-muted-foreground">مورد فعالی وجود ندارد.</p>
      )}
    </fieldset>
  );
}

export function CalendarOverrideForm({
  initial,
  buildings,
  rooms,
  onCancel,
  initialDate,
}: CalendarOverrideFormProps) {
  const [mode, setMode] = useState(
    initial?.mode ?? CalendarDayOverrideMode.CLOSED,
  );
  const [scopeAll, setScopeAll] = useState(
    initial
      ? initial.systems && initial.lunch && initial.buildingIds.length === buildings.length && initial.roomIds.length === rooms.length
      : true,
  );
  const [systems, setSystems] = useState(initial?.systems ?? true);
  const [lunch, setLunch] = useState(initial?.lunch ?? true);
  const [buildingIds, setBuildingIds] = useState(
    initial?.buildingIds ?? buildings.map(({ id }) => id),
  );
  const [roomIds, setRoomIds] = useState(
    initial?.roomIds ?? rooms.map(({ id }) => id),
  );
  const [dateValue, setDateValue] = useState("");
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "");
  const isEditing = Boolean(initial);

  const targetCount = useMemo(
    () => Number(systems) + Number(lunch) + buildingIds.length + roomIds.length,
    [lunch, buildingIds.length, roomIds.length, systems],
  );

  const hasTimedTarget = systems || buildingIds.length > 0 || roomIds.length > 0;

  const modeLabel = MODE_OPTIONS.find((o) => o.value === mode)?.label ?? "";

  // Build a compact verification summary that updates dynamically
  const summary = useMemo(() => {
    const parts: string[] = [];
    if (dateValue) {
      parts.push(dateValue);
    } else if (!isEditing) {
      return null; // No date selected yet, don't show summary
    }
    if (mode === CalendarDayOverrideMode.CUSTOM && startTime && endTime) {
      parts.push(`${modeLabel} ${startTime}–${endTime}`);
    } else {
      parts.push(modeLabel);
    }
    const count = scopeAll
      ? 1 + 1 + buildings.length + rooms.length
      : targetCount;
    parts.push(`${count.toLocaleString("fa-IR")} سرویس`);
    return parts.join(" · ");
  }, [dateValue, isEditing, mode, modeLabel, startTime, endTime, scopeAll, buildings.length, rooms.length, targetCount]);

  return (
    <form
      action={
        isEditing
          ? updateCalendarDayOverrideAction
          : createCalendarDayOverrideAction
      }
      className="grid gap-4"
    >
      {initial ? (
        <input name="overrideId" type="hidden" value={initial.overrideId} />
      ) : null}

      {/* Date — only for new overrides */}
      {!isEditing ? (
        <div className="grid max-w-xs gap-2">
          <FieldLabel htmlFor="calendar-override-date">تاریخ</FieldLabel>
          <JalaliDatePicker
            id="calendar-override-date"
            name="date"
            onValueChange={setDateValue}
            required
          />
        </div>
      ) : null}

      {/* Behavior */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">رفتار این تاریخ</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = mode === option.value;

            return (
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                  selected
                    ? "border-primary/60 bg-blue-50/60 text-blue-950"
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
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    selected ? "text-primary" : "text-slate-400",
                  )}
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span
                    className={cn(
                      "text-xs leading-5",
                      selected ? "text-blue-800/80" : "text-muted-foreground",
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

      {/* Special hours — progressive disclosure */}
      {mode === CalendarDayOverrideMode.CUSTOM && hasTimedTarget ? (
        <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <FieldLabel htmlFor={`override-start-${initial?.overrideId ?? "new"}`}>
              ساعت شروع
            </FieldLabel>
            <TextInput
              defaultValue={initial?.startTime ?? ""}
              id={`override-start-${initial?.overrideId ?? "new"}`}
              name="startTime"
              onChange={(e) => setStartTime(e.target.value)}
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
              onChange={(e) => setEndTime(e.target.value)}
              pattern="([01]\d|2[0-3]):00"
              placeholder="17:00"
              required
            />
          </div>
          <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
            ساعت مشترک برای سامانه‌ها، دفترها و اتاق‌ها؛ سرویس غذا فقط فعال می‌شود.
          </p>
        </div>
      ) : null}

      {/* Scope */}
      <fieldset className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">دامنه اثر</legend>

        <div className="mb-3 flex gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              checked={scopeAll}
              className="h-4 w-4"
              name="scope"
              onChange={() => {
                setScopeAll(true);
                setSystems(true);
                setLunch(true);
                setBuildingIds(buildings.map(({ id }) => id));
                setRoomIds(rooms.map(({ id }) => id));
              }}
              type="radio"
            />
            همه سرویس‌ها
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              checked={!scopeAll}
              className="h-4 w-4"
              name="scope"
              onChange={() => setScopeAll(false)}
              type="radio"
            />
            سرویس‌های انتخابی
          </label>
        </div>

        {scopeAll ? (
          <p className="text-xs text-muted-foreground">
            {targetCount.toLocaleString("fa-IR")} سرویس تحت تأثیر — سامانه‌ها، غذا، دفترها و اتاق‌ها
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
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
              onChange={setBuildingIds}
              options={buildings}
              selected={buildingIds}
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
        )}
      </fieldset>

      {/* Reason */}
      <div className="grid gap-2">
        <FieldLabel htmlFor={`override-reason-${initial?.overrideId ?? "new"}`}>
          دلیل تغییر (اختیاری)
        </FieldLabel>
        <TextInput
          defaultValue={initial?.reason ?? ""}
          id={`override-reason-${initial?.overrideId ?? "new"}`}
          maxLength={200}
          name="reason"
          placeholder="مثلاً تعطیلی رسمی یا تعطیلی داخلی شرکت"
        />
      </div>

      {/* Summary */}
      {summary ? (
        <div className="flex items-center gap-2 rounded-md bg-blue-50/60 px-3 py-2 text-sm">
          <Info className="h-3.5 w-3.5 shrink-0 text-blue-700" />
          <span className="text-xs leading-5 text-blue-800/80">{summary}</span>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <Button
              formAction={deleteCalendarDayOverrideAction}
              onClick={(event) => {
                if (!window.confirm("این استثنا حذف شود؟")) {
                  event.preventDefault();
                }
              }}
              type="submit"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              حذف
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              انصراف
            </Button>
          ) : null}
          <SubmitButton
            disabled={targetCount === 0}
            pendingLabel="در حال ذخیره"
            size="sm"
          >
            {isEditing ? "ذخیره تغییرات" : "ثبت روز خاص"}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}