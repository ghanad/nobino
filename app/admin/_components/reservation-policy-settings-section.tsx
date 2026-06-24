"use client";

import { useState, type ChangeEvent } from "react";
import { AlertTriangle, Save } from "lucide-react";

import { updateReservationPolicyAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

import { FieldLabel, TextInput } from "./admin-form-fields";

function ToggleRow({
  checked,
  defaultChecked,
  label,
  name,
  onChange,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  label: string;
  name: string;
  onChange?: (checked: boolean) => void;
}) {
  const inputProps =
    typeof checked === "boolean"
        ? {
          checked,
          onChange: (event: ChangeEvent<HTMLInputElement>) =>
            onChange?.(event.target.checked),
        }
      : {
          defaultChecked,
        };

  return (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
      <span>{label}</span>
      <input
        className="h-4 w-4 rounded border-input"
        name={name}
        type="checkbox"
        {...inputProps}
      />
    </label>
  );
}

export function ReservationPolicySettings({
  autoAcceptDelayHours,
  autoAcceptEnabled,
  dailyUserHourLimit,
  oneReservationPerDayEnabled,
}: {
  autoAcceptDelayHours: number;
  autoAcceptEnabled: boolean;
  dailyUserHourLimit: number;
  oneReservationPerDayEnabled: boolean;
}) {
  const [isAutoAcceptEnabled, setIsAutoAcceptEnabled] = useState(
    autoAcceptEnabled,
  );
  const [delayHours, setDelayHours] = useState(String(autoAcceptDelayHours));
  const [savedDelayHours, setSavedDelayHours] = useState(
    String(autoAcceptDelayHours),
  );

  function handleDelayChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextValue = event.target.value;
    setDelayHours(nextValue);

    const numericValue = Number(nextValue);

    if (
      nextValue.length > 0 &&
      Number.isInteger(numericValue) &&
      numericValue >= 1 &&
      numericValue <= 24
    ) {
      setSavedDelayHours(nextValue);
    }
  }

  function handleAutoAcceptToggle(nextValue: boolean): void {
    setIsAutoAcceptEnabled(nextValue);

    if (!nextValue) {
      setDelayHours(savedDelayHours);
    }
  }

  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-slate-950">سیاست رزرو کاربران</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          این تنظیم‌ها هم سقف رزرو روزانه کاربران را کنترل می‌کنند و هم زمان
          انتظار برای تایید خودکار درخواست‌های در انتظار را.
        </p>
      </div>

      <form
        action={updateReservationPolicyAction}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="grid gap-4 rounded-lg border bg-muted/20 p-4">
            <div className="grid gap-1">
              <h3 className="text-base font-semibold text-slate-950">
                محدودیت‌های رزرو کاربران
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                این تنظیم‌ها تعداد و مدت رزروهای هر کاربر را در یک روز کنترل
                می‌کنند.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-2">
                <FieldLabel htmlFor="daily-user-hour-limit">
                  سقف ساعت رزرو روزانه هر کاربر
                </FieldLabel>
                <div className="flex items-center gap-2">
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
                  <span className="inline-flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                    ساعت
                  </span>
                </div>
              </div>

              <ToggleRow
                defaultChecked={oneReservationPerDayEnabled}
                label="هر کاربر در هر روز فقط یک رزرو داشته باشد"
                name="oneReservationPerDayEnabled"
              />
            </div>
          </section>

          <section className="grid gap-4 rounded-lg border bg-muted/20 p-4">
            <div className="grid gap-1">
              <h3 className="text-base font-semibold text-slate-950">
                تأیید خودکار
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                درخواست‌های در انتظار پس از مدت تعیین‌شده و در صورت وجود ظرفیت
                کافی، به‌صورت خودکار تأیید می‌شوند.
              </p>
            </div>

            <div className="grid gap-3">
              <ToggleRow
                checked={isAutoAcceptEnabled}
                label="تأیید خودکار درخواست‌های در انتظار فعال باشد"
                name="autoAcceptEnabled"
                onChange={handleAutoAcceptToggle}
              />

              <div className="grid gap-2">
                <FieldLabel htmlFor="auto-accept-delay-hours">
                  مدت انتظار تا تأیید خودکار
                </FieldLabel>
                <input
                  name="autoAcceptDelayHours"
                  type="hidden"
                  value={savedDelayHours}
                />
                <div className="flex items-center gap-2">
                  <TextInput
                    aria-describedby="auto-accept-delay-hours-help"
                    className={`flex-1 ${
                      isAutoAcceptEnabled
                        ? ""
                        : "cursor-not-allowed bg-muted text-muted-foreground opacity-70"
                    }`}
                    disabled={!isAutoAcceptEnabled}
                    id="auto-accept-delay-hours"
                    inputMode="numeric"
                    max={24}
                    min={1}
                    onChange={handleDelayChange}
                    required={isAutoAcceptEnabled}
                    type="number"
                    value={delayHours}
                  />
                  <span className="inline-flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                    ساعت
                  </span>
                </div>
                <p
                  className="text-xs leading-5 text-muted-foreground"
                  id="auto-accept-delay-hours-help"
                >
                  این زمان از لحظه ثبت درخواست محاسبه می‌شود. هنگام تأیید،
                  ظرفیت دوباره بررسی خواهد شد.
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  اگر ظرفیت کافی نباشد، درخواست در انتظار می‌ماند و بعداً دوباره
                  بررسی می‌شود.
                </p>
              </div>

              <aside className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div className="grid gap-1 text-xs leading-5">
                    <p className="font-semibold">نکته عملیاتی</p>
                    <p>
                      فعال‌کردن این گزینه به‌تنهایی درخواست‌ها را پردازش نمی‌کند.
                      یک زمان‌بند خارجی باید endpoint تأیید خودکار را ترجیحاً هر
                      دقیقه فراخوانی کند. متغیرهای{" "}
                      <code dir="ltr">APP_BASE_URL</code> و{" "}
                      <code dir="ltr">AUTO_ACCEPT_CRON_SECRET</code> باید در محیط
                      اجرای cron تنظیم شده باشند.
                    </p>
                  </div>
                </div>
                <pre
                  className="overflow-x-auto rounded-md border border-amber-200 bg-white/80 p-3 text-left text-xs leading-5 text-slate-900"
                  dir="ltr"
                >
                  <code>{`* * * * * flock -n /tmp/nobino-auto-accept.lock curl --fail --silent --show-error -X POST -H "Authorization: Bearer \${AUTO_ACCEPT_CRON_SECRET}" "\${APP_BASE_URL}/api/internal/reservations/auto-accept"`}</code>
                </pre>
              </aside>
            </div>
          </section>
        </div>

        <div className="mt-5 flex justify-start">
          <Button className="w-full sm:w-auto" type="submit">
            <Save className="h-4 w-4" />
            ذخیره تنظیمات
          </Button>
        </div>
      </form>
    </section>
  );
}
