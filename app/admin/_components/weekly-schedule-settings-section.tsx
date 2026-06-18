import {
  CalendarCheck2,
  CalendarX2,
  Clock3,
  Save,
} from "lucide-react";

import { updateWeeklyScheduleAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

import { FieldLabel, TextInput } from "./admin-form-fields";
import {
  DAY_LABELS,
  formatPersianNumber,
  formatWorkingWindow,
  PERSIAN_WEEK_ORDER,
} from "./admin-formatting";

export function WeeklyScheduleSettings({
  schedules,
}: {
  schedules: Array<{
    id: string;
    dayOfWeek: number;
    isWorkingDay: boolean;
    startTime: string;
    endTime: string;
  }>;
}) {
  const sortedSchedules = [...schedules].sort(
    (left, right) =>
      PERSIAN_WEEK_ORDER.indexOf(left.dayOfWeek) -
      PERSIAN_WEEK_ORDER.indexOf(right.dayOfWeek),
  );
  const workingDays = schedules.filter((schedule) => schedule.isWorkingDay);
  const disabledDays = schedules.length - workingDays.length;

  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            برنامه هفتگی کاری
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            این برنامه پایه تقویم رزرو است. هر تغییر روی درخواست‌های جدید اثر
            می‌گذارد و ساعت‌ها باید دقیقاً روی ابتدای ساعت باشند.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div className="inline-flex items-center gap-2 rounded-md border bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CalendarCheck2 className="h-4 w-4" />
            <span>{formatPersianNumber(workingDays.length)} روز کاری</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <CalendarX2 className="h-4 w-4" />
            <span>{formatPersianNumber(disabledDays)} روز تعطیل</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {sortedSchedules.map((schedule) => (
          <form
            action={updateWeeklyScheduleAction}
            className="rounded-lg border bg-card p-4 shadow-sm"
            key={schedule.id}
          >
            <input name="scheduleId" type="hidden" value={schedule.id} />
            <div className="grid gap-4 lg:grid-cols-[minmax(160px,0.8fr)_140px_140px_160px_auto] lg:items-end">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      schedule.isWorkingDay ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  />
                  <p className="font-medium text-slate-950">
                    {DAY_LABELS[schedule.dayOfWeek] ??
                      `روز ${formatPersianNumber(schedule.dayOfWeek)}`}
                  </p>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatWorkingWindow(schedule)}
                </p>
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor={`weekly-start-${schedule.id}`}>
                  شروع
                </FieldLabel>
                <TextInput
                  defaultValue={schedule.startTime}
                  id={`weekly-start-${schedule.id}`}
                  name="startTime"
                  pattern="([01]\d|2[0-3]):00"
                  placeholder="09:00"
                />
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor={`weekly-end-${schedule.id}`}>
                  پایان
                </FieldLabel>
                <TextInput
                  defaultValue={schedule.endTime}
                  id={`weekly-end-${schedule.id}`}
                  name="endTime"
                  pattern="([01]\d|2[0-3]):00"
                  placeholder="17:00"
                />
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm lg:justify-center">
                <span>روز کاری باشد</span>
                <input
                  className="h-4 w-4 rounded border-input"
                  defaultChecked={schedule.isWorkingDay}
                  name="isWorkingDay"
                  type="checkbox"
                />
              </label>
              <Button className="w-full lg:w-auto" type="submit">
                <Save className="h-4 w-4" />
                ذخیره
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              برای روزهای تعطیل، ساعت‌ها در رزرو اعمال نمی‌شوند اما مقدارشان
              برای فعال‌سازی دوباره نگه داشته می‌شود.
            </p>
          </form>
        ))}
      </div>
    </section>
  );
}
