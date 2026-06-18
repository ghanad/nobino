import { Save } from "lucide-react";

import { updateReservationPolicyAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

import { FieldLabel, TextInput } from "./admin-form-fields";

export function ReservationPolicySettings({
  dailyUserHourLimit,
  oneReservationPerDayEnabled,
}: {
  dailyUserHourLimit: number;
  oneReservationPerDayEnabled: boolean;
}) {
  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-slate-950">
          سیاست رزرو کاربران
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          این محدودیت‌ها قبل از ثبت درخواست بررسی می‌شوند تا هر کاربر در یک
          روز بیشتر از سقف مجاز، زمان رزرو نکند.
        </p>
      </div>

      <form
        action={updateReservationPolicyAction}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="grid gap-4 lg:grid-cols-[220px_1fr_auto] lg:items-end">
          <div className="grid gap-2">
            <FieldLabel htmlFor="daily-user-hour-limit">
              سقف ساعت روزانه هر کاربر
            </FieldLabel>
            <TextInput
              defaultValue={dailyUserHourLimit}
              id="daily-user-hour-limit"
              inputMode="numeric"
              max={24}
              min={1}
              name="dailyUserHourLimit"
              required
              type="number"
            />
          </div>
          <label className="flex min-h-10 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
            <span>هر کاربر در هر روز فقط یک رزرو داشته باشد</span>
            <input
              className="h-4 w-4 rounded border-input"
              defaultChecked={oneReservationPerDayEnabled}
              name="oneReservationPerDayEnabled"
              type="checkbox"
            />
          </label>
          <Button className="w-full lg:w-auto" type="submit">
            <Save className="h-4 w-4" />
            ذخیره سیاست
          </Button>
        </div>
      </form>
    </section>
  );
}
