import {
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  CalendarX2,
  Clock3,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import {
  createScheduleExceptionAction,
  deleteScheduleExceptionAction,
  importIranHolidaysAction,
  updateScheduleExceptionAction,
} from "@/app/admin/actions";
import {
  ScheduleForm,
  ScheduleFormStatus,
  ScheduleSubmitButton,
} from "@/app/admin/schedule/schedule-form";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { formatJalaliDate } from "@/lib/jalali-date";

import { FieldLabel, TextInput } from "./admin-form-fields";
import { formatPersianNumber, formatWorkingWindow } from "./admin-formatting";

export function ScheduleExceptions({
  exceptions,
}: {
  exceptions: Array<{
    id: string;
    date: Date;
    isWorkingDay: boolean;
    startTime: string | null;
    endTime: string | null;
    reason: string | null;
  }>;
}) {
  const workingExceptions = exceptions.filter(
    (exception) => exception.isWorkingDay,
  ).length;
  const disabledExceptions = exceptions.length - workingExceptions;

  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            استثناهای تاریخ‌محور
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            هر استثنا فقط برای یک تاریخ جلالی است و برنامه هفتگی همان روز را
            جایگزین می‌کند؛ برای تعطیلی کامل، گزینه روز کاری را خاموش کنید.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          <span>{formatPersianNumber(exceptions.length)} استثنا</span>
        </div>
      </div>

      <form
        action={createScheduleExceptionAction}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-950">
          <Plus className="h-4 w-4 text-primary" />
          <span>ثبت استثنای جدید</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[150px_120px_120px_1fr_160px_auto] lg:items-end">
          <div className="grid gap-2">
            <FieldLabel htmlFor="exception-date">تاریخ جلالی</FieldLabel>
            <JalaliDatePicker
              id="exception-date"
              name="date"
              required
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="exception-start">شروع</FieldLabel>
            <TextInput
              id="exception-start"
              name="startTime"
              pattern="([01]\d|2[0-3]):00"
              placeholder="09:00"
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="exception-end">پایان</FieldLabel>
            <TextInput
              id="exception-end"
              name="endTime"
              pattern="([01]\d|2[0-3]):00"
              placeholder="17:00"
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="exception-reason">دلیل</FieldLabel>
            <TextInput
              id="exception-reason"
              maxLength={200}
              name="reason"
              placeholder="تعطیلی رسمی، سرویس دوره‌ای یا ساعت ویژه"
            />
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm lg:justify-center">
            <span>روز کاری باشد</span>
            <input
              className="h-4 w-4 rounded border-input"
              defaultChecked
              name="isWorkingDay"
              type="checkbox"
            />
          </label>
          <Button className="w-full lg:w-auto" type="submit">
            <Plus className="h-4 w-4" />
            ثبت
          </Button>
        </div>
      </form>

      {exceptions.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
          هنوز استثنای تاریخ‌محور ثبت نشده است.
        </div>
      ) : (
        <ScheduleForm
          action={updateScheduleExceptionAction}
          className="overflow-hidden rounded-xl border bg-card shadow-sm"
        >
          <input
            name="exceptionCount"
            type="hidden"
            value={exceptions.length}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border-b border-l bg-emerald-50/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  روز کاری ویژه
                </p>
                <CalendarCheck2 className="h-4 w-4 text-emerald-700" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-emerald-700">
                {formatPersianNumber(workingExceptions)}
              </p>
            </div>
            <div className="border-b bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  تعطیلی ویژه
                </p>
                <CalendarX2 className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-700">
                {formatPersianNumber(disabledExceptions)}
              </p>
            </div>
          </div>
          {exceptions.map((exception, index) => (
            <div
              className="border-b p-4 transition-colors hover:bg-slate-50/60"
              key={exception.id}
            >
              <input
                name={`exceptions.${index}.exceptionId`}
                type="hidden"
                value={exception.id}
              />
              <div className="grid gap-4 lg:grid-cols-[minmax(210px,0.9fr)_120px_120px_1fr_160px_auto] lg:items-end">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        exception.isWorkingDay ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                    <p className="truncate font-medium text-slate-950">
                      {formatJalaliDate(exception.date)}
                    </p>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatWorkingWindow(exception)}
                  </p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`exception-start-${exception.id}`}>
                    شروع
                  </FieldLabel>
                  <TextInput
                    defaultValue={exception.startTime ?? ""}
                    id={`exception-start-${exception.id}`}
                    name={`exceptions.${index}.startTime`}
                    pattern="([01]\d|2[0-3]):00"
                    placeholder="09:00"
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`exception-end-${exception.id}`}>
                    پایان
                  </FieldLabel>
                  <TextInput
                    defaultValue={exception.endTime ?? ""}
                    id={`exception-end-${exception.id}`}
                    name={`exceptions.${index}.endTime`}
                    pattern="([01]\d|2[0-3]):00"
                    placeholder="17:00"
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`exception-reason-${exception.id}`}>
                    دلیل
                  </FieldLabel>
                  <TextInput
                    defaultValue={exception.reason ?? ""}
                    id={`exception-reason-${exception.id}`}
                    maxLength={200}
                    name={`exceptions.${index}.reason`}
                    placeholder="بدون توضیح"
                  />
                </div>
                <label className="flex min-h-10 items-center gap-2 text-sm lg:justify-center">
                  <span>روز کاری باشد</span>
                  <input
                    className="h-4 w-4 rounded border-input"
                    defaultChecked={exception.isWorkingDay}
                    name={`exceptions.${index}.isWorkingDay`}
                    type="checkbox"
                  />
                </label>
                <Button
                  className="w-full lg:w-auto"
                  formAction={deleteScheduleExceptionAction.bind(
                    null,
                    exception.id,
                  )}
                  type="submit"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              </div>
            </div>
          ))}
          <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t bg-slate-50/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <ScheduleFormStatus />
            <ScheduleSubmitButton
              className="w-full sm:w-auto"
              pendingLabel="در حال ذخیره"
              size="sm"
            >
              <Save className="h-4 w-4" />
              ذخیره تغییرات استثناها
            </ScheduleSubmitButton>
          </div>
        </ScheduleForm>
      )}
    </section>
  );
}

export function IranHolidayImport({
  currentJalaliYear,
}: {
  currentJalaliYear: string;
}) {
  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-slate-950">
          ورود تعطیلی‌های رسمی ایران
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          تعطیلی‌های رسمی سال انتخاب‌شده را از منبع به‌روز تقویم همگام کنید.
        </p>
      </div>

      <form
        action={importIranHolidaysAction}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-950">
          <CalendarPlus className="h-4 w-4 text-primary" />
          <span>همگام‌سازی تعطیلی‌ها</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <FieldLabel htmlFor="iran-holiday-year">سال جلالی</FieldLabel>
            <TextInput
              defaultValue={currentJalaliYear}
              id="iran-holiday-year"
              inputMode="numeric"
              max="1600"
              min="1300"
              name="year"
              required
              type="number"
            />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            تاریخ‌های جابه‌جاشده اصلاح و موارد قدیمی حذف می‌شوند. استثناهای
            دستی مدیر بدون تغییر باقی می‌مانند.
          </p>
          <Button className="w-full sm:w-auto" type="submit">
            <CalendarPlus className="h-4 w-4" />
            همگام‌سازی تعطیلی‌ها
          </Button>
        </div>
      </form>
    </section>
  );
}
