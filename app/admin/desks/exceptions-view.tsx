"use client";

import {
  CalendarDays,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";

import {
  deleteBuildingExceptionAction,
  upsertBuildingExceptionAction,
} from "@/app/admin/desks/actions";
import { AdminDeskForm } from "@/app/admin/desks/admin-desk-form";
import { BuildingPicker } from "@/app/admin/desks/building-picker";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatJalaliDate } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

const inputClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-slate-900 outline-none ring-offset-background transition placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring";

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "good" | "muted" | "neutral" | "global";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium",
        tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "muted" && "border-slate-200 bg-slate-50 text-slate-500",
        tone === "neutral" && "border-blue-200 bg-blue-50 text-blue-700",
        tone === "global" && "border-purple-200 bg-purple-50 text-purple-700",
      )}
    >
      {children}
    </span>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function ViewPageHeader({
  badge,
  buildingSelector,
  description,
  icon: Icon,
  title,
}: {
  badge?: ReactNode;
  buildingSelector?: ReactNode;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <div className="grid gap-0.5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {badge}
        {buildingSelector}
      </div>
    </div>
  );
}

function AddExceptionForm({
  buildingId,
  onCancel,
  onSuccess,
}: {
  buildingId: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [actionState, setActionState] = useState<{
    id?: string;
    message?: string;
    ok?: boolean;
  }>({});

  const handleAction = useCallback(
    async (formData: FormData) => {
      const result = await upsertBuildingExceptionAction({}, formData);
      setActionState(result);
      if (result.ok) {
        router.refresh();
        onSuccess();
      }
    },
    [onSuccess, router],
  );

  return (
    <form
      action={handleAction}
      className="grid min-w-0 gap-3 rounded-lg border bg-slate-50/60 p-4 lg:grid-cols-[minmax(140px,170px)_minmax(140px,160px)_minmax(100px,120px)_minmax(100px,120px)_minmax(120px,1fr)_auto_auto] lg:items-end"
    >
      <input name="buildingId" type="hidden" value={buildingId} />
      <Field label="تاریخ">
        <JalaliDatePicker
          inputClassName="h-9"
          name="date"
          required
        />
      </Field>
      <div className="grid gap-1 text-sm font-medium text-slate-700">
        وضعیت
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 font-normal text-slate-700">
          <input
            className="h-4 w-4 shrink-0 rounded accent-primary"
            defaultChecked
            name="isWorkingDay"
            type="checkbox"
          />
          روز کاری
        </label>
      </div>
      <Field label="شروع">
        <input
          aria-label="ساعت شروع"
          className={cn(inputClass, "text-left")}
          defaultValue="09:00"
          name="startTime"
          step={3600}
          type="time"
        />
      </Field>
      <Field label="پایان">
        <input
          aria-label="ساعت پایان"
          className={cn(inputClass, "text-left")}
          defaultValue="17:00"
          name="endTime"
          step={3600}
          type="time"
        />
      </Field>
      <Field label="دلیل (اختیاری)">
        <input
          className={inputClass}
          maxLength={200}
          name="reason"
          placeholder="مثلاً تعطیلی رسمی"
        />
      </Field>
      <SubmitButton pendingLabel="در حال ثبت" size="sm">
        <Plus className="h-4 w-4" />
        ثبت
      </SubmitButton>
      <button
        className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm text-slate-600 transition hover:bg-slate-100"
        onClick={onCancel}
        type="button"
      >
        <X className="h-4 w-4" />
        انصراف
      </button>
      {actionState.message ? (
        <p
          className={cn(
            "lg:col-span-full text-xs",
            actionState.ok ? "text-emerald-700" : "text-red-600",
          )}
        >
          {actionState.message}
        </p>
      ) : null}
    </form>
  );
}

export function ExceptionsView({
  building,
  buildings,
}: {
  building: {
    id: string;
    exceptions: Array<{
      id: string;
      date: Date;
      isWorkingDay: boolean;
      startTime: string | null;
      endTime: string | null;
      reason: string | null;
    }>;
  };
  buildings: Array<{
    id: string;
    name: string;
    active: boolean;
  }>;
}) {
  const hasExceptions = building.exceptions.length > 0;
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", "min-w-0")}>
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <ViewPageHeader
          badge={
            hasExceptions ? (
              <StatusPill tone="muted">
                {building.exceptions.length} مورد
              </StatusPill>
            ) : null
          }
          buildingSelector={
            <BuildingPicker
              buildings={buildings}
              selectedBuildingId={building.id}
              view="exceptions"
            />
          }
          description="برای تاریخ‌های خاص، ساعات یا شرایط رزرو متفاوت تعریف کنید."
          icon={CalendarDays}
          title="استثناهای تقویم"
        />
      </div>

      <div className="grid gap-4 p-5">
        {/* Exception list */}
        {hasExceptions ? (
          <div className="grid gap-2">
            {building.exceptions.map((exception) => {
              return (
                <div
                  className="flex flex-col gap-3 rounded-lg border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  key={exception.id}
                >
                  <div className="grid gap-0.5">
                    <strong className="text-sm">
                      {formatJalaliDate(exception.date)}
                    </strong>
                    <span className="text-xs leading-5 text-slate-600">
                      {exception.isWorkingDay
                        ? `${exception.startTime} تا ${exception.endTime}`
                        : "تعطیل"}
                      {exception.reason ? ` · ${exception.reason}` : ""}
                    </span>
                  </div>
                  <AdminDeskForm action={deleteBuildingExceptionAction}>
                    <input
                      name="exceptionId"
                      type="hidden"
                      value={exception.id}
                    />
                    <input
                      name="buildingId"
                      type="hidden"
                      value={building.id}
                    />
                    <SubmitButton
                      className="w-full sm:w-auto"
                      pendingLabel="در حال حذف"
                      size="sm"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                      حذف
                    </SubmitButton>
                  </AdminDeskForm>
                </div>
              );
            })}
          </div>
        ) : !showAddForm ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-6 text-center">
            <p className="text-sm text-muted-foreground">
              هنوز استثنایی برای این ساختمان ثبت نشده است.
            </p>
          </div>
        ) : null}

        {/* Add exception action / form */}
        {!showAddForm ? (
          <div className="flex justify-start">
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-slate-700 transition hover:border-primary/50 hover:text-primary"
              onClick={() => setShowAddForm(true)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              افزودن استثنا
            </button>
          </div>
        ) : (
          <AddExceptionForm
            buildingId={building.id}
            onCancel={() => setShowAddForm(false)}
            onSuccess={() => setShowAddForm(false)}
          />
        )}
      </div>
    </section>
  );
}