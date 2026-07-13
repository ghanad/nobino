import {
  CalendarDays,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import {
  createCapacityExceptionAction,
  deleteCapacityExceptionAction,
  updateCapacityExceptionAction,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { formatJalaliDate } from "@/lib/jalali-date";

import { FieldLabel, SelectInput, TextInput } from "./admin-form-fields";
import { formatPersianNumber } from "./admin-formatting";

export function CapacityExceptions({
  capacityExceptions,
  resourcePools,
}: {
  capacityExceptions: Array<{
    id: string;
    date: Date;
    capacity: number;
    reason: string | null;
    resourcePool: {
      id: string;
      name: string;
      capacity: number;
    };
  }>;
  resourcePools: Array<{
    id: string;
    name: string;
    capacity: number;
    active: boolean;
  }>;
}) {
  const hasResourcePools = resourcePools.length > 0;

  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            استثناهای ظرفیت روزانه
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            برای تاریخ‌های خاص مثل تعمیرات یا کاهش موقت سیستم‌ها، ظرفیت همان
            روز را با تاریخ جلالی تغییر دهید. مقدار جدید باید رزروهای
            تاییدشده همان روز را پوشش دهد.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          <span>{formatPersianNumber(capacityExceptions.length)} استثنا</span>
        </div>
      </div>

      <form
        action={createCapacityExceptionAction}
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-950">
          <Plus className="h-4 w-4 text-primary" />
          <span>ثبت استثنای جدید</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_170px_140px_1fr_auto] lg:items-end">
          <div className="grid gap-2">
            <FieldLabel htmlFor="capacity-exception-pool">مخزن</FieldLabel>
            <SelectInput
              disabled={!hasResourcePools}
              id="capacity-exception-pool"
              name="resourcePoolId"
            >
              {resourcePools.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name}، پیش‌فرض {formatPersianNumber(pool.capacity)}
                </option>
              ))}
            </SelectInput>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="capacity-exception-date">
              تاریخ جلالی
            </FieldLabel>
            <JalaliDatePicker
              id="capacity-exception-date"
              name="date"
              required
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="capacity-exception-capacity">
              ظرفیت همان روز
            </FieldLabel>
            <TextInput
              id="capacity-exception-capacity"
              inputMode="numeric"
              max={50}
              min={0}
              name="capacity"
              required
              type="number"
            />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="capacity-exception-reason">دلیل</FieldLabel>
            <TextInput
              id="capacity-exception-reason"
              maxLength={200}
              name="reason"
              placeholder="تعمیر، سرویس دوره‌ای یا تغییر موقت ظرفیت"
            />
          </div>
          <Button
            className="w-full lg:w-auto"
            disabled={!hasResourcePools}
            type="submit"
          >
            <Plus className="h-4 w-4" />
            ثبت
          </Button>
        </div>
      </form>

      {capacityExceptions.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
          هیچ استثنای ظرفیتی ثبت نشده است.
        </div>
      ) : (
        <div className="grid gap-3">
          {capacityExceptions.map((exception) => (
            <form
              action={updateCapacityExceptionAction}
              className="rounded-lg border bg-card p-4 shadow-sm"
              key={exception.id}
            >
              <input
                name="capacityExceptionId"
                type="hidden"
                value={exception.id}
              />
              <div className="grid gap-4 lg:grid-cols-[minmax(180px,0.9fr)_140px_1fr_auto_auto] lg:items-end">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-500" />
                    <p className="truncate font-medium text-slate-950">
                      {exception.resourcePool.name}
                    </p>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {formatJalaliDate(exception.date)}، پیش‌فرض{" "}
                    {formatPersianNumber(exception.resourcePool.capacity)}
                  </p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor={`capacity-exception-value-${exception.id}`}
                  >
                    ظرفیت
                  </FieldLabel>
                  <TextInput
                    defaultValue={exception.capacity}
                    id={`capacity-exception-value-${exception.id}`}
                    inputMode="numeric"
                    max={50}
                    min={0}
                    name="capacity"
                    required
                    type="number"
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel
                    htmlFor={`capacity-exception-reason-${exception.id}`}
                  >
                    دلیل
                  </FieldLabel>
                  <TextInput
                    defaultValue={exception.reason ?? ""}
                    id={`capacity-exception-reason-${exception.id}`}
                    maxLength={200}
                    name="reason"
                    placeholder="بدون توضیح"
                  />
                </div>
                <Button className="w-full lg:w-auto" type="submit">
                  <Save className="h-4 w-4" />
                  ذخیره
                </Button>
                <Button
                  className="w-full lg:w-auto"
                  formAction={deleteCapacityExceptionAction}
                  type="submit"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              </div>
            </form>
          ))}
        </div>
      )}
    </section>
  );
}
