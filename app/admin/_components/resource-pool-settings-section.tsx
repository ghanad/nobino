"use client";

import { AlertTriangle, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { updateResourcePoolAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

import { FieldLabel, SelectInput, TextInput } from "./admin-form-fields";
import { formatPersianNumber } from "./admin-formatting";

export function ResourcePoolSettings({
  buildings,
  resourcePools,
}: {
  buildings: Array<{
    id: string;
    name: string;
  }>;
  resourcePools: Array<{
    id: string;
    name: string;
    capacity: number;
    active: boolean;
    building: {
      id: string;
      isTransitional: boolean;
      name: string;
    };
  }>;
}) {
  const selectableBuildingIds = new Set(buildings.map((building) => building.id));
  const [buildingSelections, setBuildingSelections] = useState(() =>
    Object.fromEntries(
      resourcePools.map((pool) => [
        pool.id,
        selectableBuildingIds.has(pool.building.id) ? pool.building.id : "",
      ]),
    ),
  );
  const availablePools = resourcePools.filter(
    (pool) => pool.active && selectableBuildingIds.has(pool.building.id),
  );
  const totalAvailableCapacity = availablePools.reduce(
    (sum, pool) => sum + pool.capacity,
    0,
  );
  const transitionalPools = resourcePools.filter(
    (pool) => pool.building.isTransitional,
  );
  const reservableBuildings = [
    ...new Set(availablePools.map((pool) => pool.building.name)),
  ];
  const buildingSummary =
    reservableBuildings.length === 0
      ? "بدون ساختمان فعال"
      : reservableBuildings.length === 1
        ? reservableBuildings[0]
        : `${reservableBuildings[0]} و ${formatPersianNumber(reservableBuildings.length - 1)} ساختمان دیگر`;

  return (
    <section className="grid gap-4 text-card-foreground" dir="rtl">
      <div className="grid gap-1">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">
            تنظیمات ظرفیت
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            تعداد سیستم‌هایی را که هم‌زمان قابل رزرو هستند، برای هر ساختمان
            تنظیم کنید.
          </p>
        </div>
      </div>

      {buildings.length === 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          ابتدا یک ساختمان واقعی ایجاد کنید؛ سپس می‌توانید تنظیمات سیستم‌ها را
          به آن تخصیص دهید. {" "}
          <Link
            className="font-medium text-amber-950 underline underline-offset-4"
            href="/admin/buildings"
          >
            رفتن به مدیریت مرکزی ساختمان‌ها
          </Link>
        </div>
      ) : null}

      {transitionalPools.length > 0 ? (
        <div className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:grid-cols-[auto_1fr] sm:items-start">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <h3 className="font-medium">نیازمند تعیین ساختمان</h3>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              {formatPersianNumber(transitionalPools.length)} تنظیمات سیستم‌ها
              هنوز به ساختمان واقعی متصل نیست و تا زمان تعیین ساختمان قابل رزرو
              نیست. برای هر مورد، ساختمان مقصد را انتخاب و ذخیره کنید.
            </p>
          </div>
        </div>
      ) : null}

      {resourcePools.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
          هنوز تنظیمات ظرفیتی برای سیستم‌ها ثبت نشده است.
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y py-2 text-sm">
            <span className="font-medium text-slate-950">{buildingSummary}</span>
            <span
              aria-hidden="true"
              className="h-1 w-1 rounded-full bg-slate-400"
            />
            <span className="text-slate-700">
              {formatPersianNumber(totalAvailableCapacity)} سیستم قابل رزرو
            </span>
            <span
              aria-hidden="true"
              className="h-1 w-1 rounded-full bg-slate-400"
            />
            <span
              className={
                availablePools.length > 0
                  ? "font-medium text-emerald-700"
                  : "font-medium text-slate-600"
              }
            >
              {availablePools.length > 0
                ? "رزرو فعال است"
                : "رزرو غیرفعال است"}
            </span>
          </div>

          <div className="grid gap-3">
            {resourcePools.map((pool) => {
              const currentBuildingIsSelectable = selectableBuildingIds.has(
                pool.building.id,
              );
              const needsBuildingAssignment =
                pool.building.isTransitional || !currentBuildingIsSelectable;
              const selectedBuildingId = buildingSelections[pool.id] ?? "";
              const hasSelectedBuilding = selectableBuildingIds.has(
                selectedBuildingId,
              );
              const assignmentWarning = pool.building.isTransitional
                ? "این مخزن تا زمان انتخاب ساختمان واقعی در دسترس کاربران نیست."
                : "ساختمان فعلی غیرفعال است؛ مقصد فعال را آگاهانه انتخاب کنید.";

              return (
              <form
                action={updateResourcePoolAction}
                className={`rounded-lg border bg-card p-4 ${
                  needsBuildingAssignment
                    ? "border-amber-300 bg-amber-50/40"
                    : ""
                }`}
                key={pool.id}
              >
                <input name="resourcePoolId" type="hidden" value={pool.id} />
                <div className="grid gap-4 lg:grid-cols-[minmax(180px,1fr)_minmax(200px,1fr)_150px_160px] lg:items-end">
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          pool.active ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                      <FieldLabel htmlFor={`pool-name-${pool.id}`}>
                        نام
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
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor={`pool-building-${pool.id}`}>
                        ساختمان
                      </FieldLabel>
                      {needsBuildingAssignment ? (
                        <span className="text-xs font-medium text-amber-800">
                          {pool.building.isTransitional
                            ? "نیازمند تعیین ساختمان"
                            : "نیازمند انتخاب مقصد"}
                        </span>
                      ) : null}
                    </div>
                    <SelectInput
                      onChange={(event) => {
                        setBuildingSelections((selections) => ({
                          ...selections,
                          [pool.id]: event.target.value,
                        }));
                      }}
                      id={`pool-building-${pool.id}`}
                      name="buildingId"
                      required
                      value={selectedBuildingId}
                    >
                      {needsBuildingAssignment ? (
                        <option disabled value="">
                          ساختمان فعال را انتخاب کنید
                        </option>
                      ) : null}
                      {buildings.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name}
                        </option>
                      ))}
                    </SelectInput>
                    {needsBuildingAssignment ? (
                      <p className="text-xs leading-5 text-amber-900">
                        {assignmentWarning}
                      </p>
                    ) : null}
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
                  <div className="grid gap-2">
                    <FieldLabel htmlFor={`pool-active-${pool.id}`}>
                      وضعیت
                    </FieldLabel>
                    <label className="flex h-10 cursor-pointer items-center justify-between rounded-md border bg-muted/20 px-3 text-sm">
                      <span className="sr-only">فعال بودن رزرو سیستم‌ها</span>
                      <input
                        className="peer sr-only"
                        defaultChecked={pool.active}
                        id={`pool-active-${pool.id}`}
                        name="active"
                        type="checkbox"
                      />
                      <span className="text-muted-foreground peer-checked:hidden">
                        غیرفعال
                      </span>
                      <span className="hidden font-medium text-slate-950 peer-checked:inline">
                        فعال
                      </span>
                      <span
                        aria-hidden="true"
                        className="relative h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 after:absolute after:right-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:-translate-x-4"
                      />
                    </label>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {needsBuildingAssignment
                    ? assignmentWarning
                    : "فقط رزروهای تأییدشده از ظرفیت استفاده می‌کنند. تغییر ساختمان با وجود رزرو آینده ممکن نیست."}
                </p>
                <div className="mt-3 flex justify-end border-t pt-3">
                  <Button
                    disabled={!hasSelectedBuilding}
                    type="submit"
                  >
                    <Save className="h-4 w-4" />
                    ذخیره
                  </Button>
                </div>
              </form>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
