import { CheckCircle2, Database, Gauge, Save } from "lucide-react";

import { updateResourcePoolAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

import { FieldLabel, TextInput } from "./admin-form-fields";
import { formatPersianNumber } from "./admin-formatting";

export function ResourcePoolSettings({
  resourcePools,
}: {
  resourcePools: Array<{
    id: string;
    name: string;
    capacity: number;
    active: boolean;
  }>;
}) {
  const activePools = resourcePools.filter((pool) => pool.active);
  const totalActiveCapacity = activePools.reduce(
    (sum, pool) => sum + pool.capacity,
    0,
  );
  const inactivePools = resourcePools.length - activePools.length;

  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            ظرفیت پایه سیستم‌ها
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Nobino سیستم‌ها را به عنوان یک مخزن ظرفیت مدیریت می‌کند. کاهش
            ظرفیت فقط وقتی ذخیره می‌شود که رزروهای تاییدشده آینده از مقدار
            جدید بیشتر نباشند.
          </p>
        </div>
      </div>

      {resourcePools.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
          هنوز مخزن ظرفیتی تعریف نشده است.
        </div>
      ) : (
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  ظرفیت فعال
                </p>
                <Gauge className="h-4 w-4 text-emerald-700" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-emerald-700">
                {formatPersianNumber(totalActiveCapacity)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  مخزن فعال
                </p>
                <Database className="h-4 w-4 text-blue-700" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-blue-700">
                {formatPersianNumber(activePools.length)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  غیرفعال
                </p>
                <CheckCircle2 className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-700">
                {formatPersianNumber(inactivePools)}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {resourcePools.map((pool) => (
              <form
                action={updateResourcePoolAction}
                className="rounded-lg border bg-card p-4 shadow-sm"
                key={pool.id}
              >
                <input name="resourcePoolId" type="hidden" value={pool.id} />
                <div className="grid gap-4 lg:grid-cols-[1fr_150px_160px_auto] lg:items-end">
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          pool.active ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                      <FieldLabel htmlFor={`pool-name-${pool.id}`}>
                        نام مخزن
                      </FieldLabel>
                    </div>
                    <TextInput
                      defaultValue={pool.name}
                      id={`pool-name-${pool.id}`}
                      maxLength={100}
                      name="name"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel htmlFor={`pool-capacity-${pool.id}`}>
                      ظرفیت همزمان
                    </FieldLabel>
                    <TextInput
                      defaultValue={pool.capacity}
                      id={`pool-capacity-${pool.id}`}
                      inputMode="numeric"
                      max={50}
                      min={1}
                      name="capacity"
                      required
                      type="number"
                    />
                  </div>
                  <label className="flex min-h-10 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                    <span>فعال باشد</span>
                    <input
                      className="h-4 w-4 rounded border-input"
                      defaultChecked={pool.active}
                      name="active"
                      type="checkbox"
                    />
                  </label>
                  <Button className="w-full lg:w-auto" type="submit">
                    <Save className="h-4 w-4" />
                    ذخیره
                  </Button>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  فقط رزروهای تاییدشده ظرفیت را مصرف می‌کنند؛ درخواست‌های در
                  انتظار در تقویم دیده می‌شوند اما جلوی درخواست جدید را
                  نمی‌گیرند.
                </p>
              </form>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
