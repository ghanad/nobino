import { Save, Trash2 } from "lucide-react";

import {
  deleteCapacityExceptionAction,
  updateCapacityExceptionAction,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { formatJalaliDate } from "@/lib/jalali-date";

import { CapacityExceptionCreator } from "./capacity-exception-creator";
import { FieldLabel, TextInput } from "./admin-form-fields";
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
      building: { name: string };
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
  return (
    <section
      className="grid gap-3 border-t pt-6 text-card-foreground"
      dir="rtl"
    >
      <div className="grid gap-1">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            استثناهای روزانه
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            برای روزهای خاص، ظرفیت رزرو سیستم‌ها را به‌طور موقت تغییر دهید.
          </p>
        </div>
      </div>

      <CapacityExceptionCreator resourcePools={resourcePools} />

      {capacityExceptions.length === 0 ? (
        <div className="rounded-md border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
          هیچ استثنایی ثبت نشده است.
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="hidden border-b px-4 pb-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(160px,1fr)_140px_120px_minmax(180px,1fr)_auto] lg:items-center lg:gap-4">
            <span>سیستم / ساختمان</span>
            <span>تاریخ</span>
            <span>ظرفیت</span>
            <span>دلیل</span>
            <span>عملیات</span>
          </div>
          {capacityExceptions.map((exception) => (
            <form
              action={updateCapacityExceptionAction}
              className="rounded-lg border bg-card p-4 lg:rounded-md"
              key={exception.id}
            >
              <input
                name="capacityExceptionId"
                type="hidden"
                value={exception.id}
              />
              <div className="grid gap-4 lg:grid-cols-[minmax(160px,1fr)_140px_120px_minmax(180px,1fr)_auto] lg:items-end">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-950">
                    {exception.resourcePool.name}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {exception.resourcePool.building.name}، ظرفیت پیش‌فرض{" "}
                    {formatPersianNumber(exception.resourcePool.capacity)}
                  </p>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground lg:hidden">
                    تاریخ
                  </span>
                  <p className="text-sm text-slate-700">
                    {formatJalaliDate(exception.date)}
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
                <div className="flex gap-2 lg:items-center">
                  <Button
                    className="flex-1 lg:flex-none"
                    size="sm"
                    type="submit"
                  >
                    <Save className="h-4 w-4" />
                    ذخیره
                  </Button>
                  <Button
                    aria-label="حذف استثنا"
                    className="flex-1 lg:flex-none"
                    formAction={deleteCapacityExceptionAction}
                    size="sm"
                    type="submit"
                    variant="outline"
                  >
                    <Trash2 className="h-4 w-4" />
                    حذف
                  </Button>
                </div>
              </div>
            </form>
          ))}
        </div>
      )}
    </section>
  );
}
