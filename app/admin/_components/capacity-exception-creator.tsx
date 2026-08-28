"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";

import { createCapacityExceptionAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";

import { FieldLabel, SelectInput, TextInput } from "./admin-form-fields";
import { formatPersianNumber } from "./admin-formatting";

type ResourcePoolOption = {
  active: boolean;
  capacity: number;
  id: string;
  name: string;
};

export function CapacityExceptionCreator({
  resourcePools,
}: {
  resourcePools: ResourcePoolOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const formId = useId();
  const hasResourcePools = resourcePools.length > 0;

  return (
    <div className="grid gap-4">
      <div>
        <Button
          aria-controls={formId}
          aria-expanded={isOpen}
          disabled={!hasResourcePools}
          onClick={() => setIsOpen((open) => !open)}
          type="button"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          افزودن استثنا
        </Button>
        {!hasResourcePools ? (
          <p className="mt-2 text-xs text-muted-foreground">
            ابتدا تنظیمات ظرفیت سیستم‌ها را ثبت کنید.
          </p>
        ) : null}
      </div>

      {isOpen ? (
        <form
          action={createCapacityExceptionAction}
          className="rounded-lg border bg-muted/20 p-4"
          id={formId}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-slate-950">استثنای جدید</h3>
            <Button
              aria-label="بستن فرم ثبت استثنا"
              onClick={() => setIsOpen(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X className="h-4 w-4" />
              انصراف
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(180px,1fr)_170px_140px_minmax(220px,1fr)_auto] lg:items-end">
            <div className="grid gap-2">
              <FieldLabel htmlFor="capacity-exception-pool">
                سیستم‌ها
              </FieldLabel>
              <SelectInput id="capacity-exception-pool" name="resourcePoolId">
                {resourcePools.map((pool) => (
                  <option key={pool.id} value={pool.id}>
                    {pool.name}، ظرفیت پیش‌فرض{" "}
                    {formatPersianNumber(pool.capacity)}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="capacity-exception-date">تاریخ</FieldLabel>
              <JalaliDatePicker
                id="capacity-exception-date"
                name="date"
                required
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="capacity-exception-capacity">ظرفیت</FieldLabel>
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
                placeholder="تعمیر، سرویس دوره‌ای یا تغییر موقت"
              />
            </div>
            <Button className="w-full lg:w-auto" type="submit">
              ثبت استثنا
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
