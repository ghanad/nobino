import { CalendarDays, CalendarPlus } from "lucide-react";

import { importIranHolidaysAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { formatJalaliDate } from "@/lib/jalali-date";

import { FieldLabel, TextInput } from "./admin-form-fields";
import { formatPersianNumber } from "./admin-formatting";

export function OfficialHolidaySettings({
  currentJalaliYear,
  holidays,
}: {
  currentJalaliYear: string;
  holidays: Array<{
    date: Date;
    reason: string | null;
  }>;
}) {
  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            تعطیلات رسمی ایران
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            تعطیلات رسمی برای سامانه‌ها همگام می‌شوند. برای تعطیلی، روز کاری یا
            ساعت ویژه، از بخش «روزهای خاص» استفاده کنید.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          <span>ثبت تغییرات از روزهای خاص</span>
        </div>
      </div>

      <form
        action={importIranHolidaysAction}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-950">
          <CalendarPlus className="h-4 w-4 text-primary" />
          <span>همگام‌سازی تعطیلات رسمی ایران</span>
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
            تاریخ‌های جابه‌جاشده اصلاح و موارد قدیمی حذف می‌شوند. برای هر تغییر
            دستی در تقویم، «روزهای خاص» مرجع واحد است.
          </p>
          <Button className="w-full sm:w-auto" type="submit">
            <CalendarPlus className="h-4 w-4" />
            همگام‌سازی تعطیلات
          </Button>
        </div>
      </form>

      <section className="grid gap-3" aria-labelledby="official-holidays-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3
              className="text-base font-semibold text-slate-950"
              id="official-holidays-heading"
            >
              تعطیلات همگام‌شده
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              این فهرست فقط برای مشاهده است.
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            {formatPersianNumber(holidays.length)} تعطیلی
          </span>
        </div>

        {holidays.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
            هنوز تعطیلی رسمی همگام‌سازی نشده است.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {holidays.map((holiday) => (
              <div
                className="flex flex-col gap-1 border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                key={holiday.date.toISOString()}
              >
                <span className="font-medium text-slate-950">
                  {formatJalaliDate(holiday.date)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {holiday.reason ?? "تعطیل رسمی"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
