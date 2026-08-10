"use client";

import { AlertTriangle, CheckCircle2, Database, Gauge, Save } from "lucide-react";
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
  const inactivePools = resourcePools.filter((pool) => !pool.active).length;
  const transitionalPools = resourcePools.filter(
    (pool) => pool.building.isTransitional,
  );

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

      {buildings.length === 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          ابتدا یک ساختمان واقعی ایجاد کنید؛ سپس می‌توانید مخزن‌های ظرفیت را به آن تخصیص دهید. {" "}
          <Link className="font-medium text-amber-950 underline underline-offset-4" href="/admin/desks">
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
              {formatPersianNumber(transitionalPools.length)} مخزن هنوز به ساختمان واقعی متصل نیست و تا زمان تعیین ساختمان قابل رزرو نیست. برای هر مورد، ساختمان مقصد را انتخاب و ذخیره کنید.
            </p>
          </div>
        </div>
      ) : null}

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
                  ظرفیت قابل رزرو
                </p>
                <Gauge className="h-4 w-4 text-emerald-700" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-emerald-700">
                {formatPersianNumber(totalAvailableCapacity)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  مخزن قابل رزرو
                </p>
                <Database className="h-4 w-4 text-blue-700" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-blue-700">
                {formatPersianNumber(availablePools.length)}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {transitionalPools.length > 0
                    ? "نیازمند تعیین ساختمان"
                    : "غیرفعال"}
                </p>
                {transitionalPools.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-slate-500" />
                )}
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-700">
                {formatPersianNumber(
                  transitionalPools.length > 0
                    ? transitionalPools.length
                    : inactivePools,
                )}
              </p>
            </div>
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
                className={`rounded-lg border bg-card p-4 shadow-sm ${
                  needsBuildingAssignment
                    ? "border-amber-300 bg-amber-50/40"
                    : ""
                }`}
                key={pool.id}
              >
                <input name="resourcePoolId" type="hidden" value={pool.id} />
                <div className="grid gap-4 lg:grid-cols-[minmax(180px,1fr)_minmax(200px,1fr)_150px_160px_auto] lg:items-end">
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
                  <label className="flex min-h-10 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                    <span>فعال باشد</span>
                    <input
                      className="h-4 w-4 rounded border-input"
                      defaultChecked={pool.active}
                      name="active"
                      type="checkbox"
                    />
                  </label>
                  <Button
                    className="w-full lg:w-auto"
                    disabled={!hasSelectedBuilding}
                    type="submit"
                  >
                    <Save className="h-4 w-4" />
                    ذخیره
                  </Button>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {needsBuildingAssignment
                    ? assignmentWarning
                    : "فقط رزروهای تاییدشده ظرفیت را مصرف می‌کنند؛ درخواست‌های در انتظار در تقویم دیده می‌شوند اما جلوی درخواست جدید را نمی‌گیرند."}
                  {pool.building.isTransitional
                    ? " تعیین ساختمان زمان یا ظرفیت رزروهای موجود را تغییر نمی‌دهد."
                    : " تغییر ساختمان برای مخزنی که رزرو آینده دارد، برای جلوگیری از تغییر ناخواسته مکان رزروها مسدود می‌شود."}
                </p>
              </form>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
