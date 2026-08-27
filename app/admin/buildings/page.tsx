import { UserRole } from "@prisma/client";
import { Building2, LayoutGrid, Plus, Save } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  createBuildingAction,
  deleteBuildingAction,
  updateBuildingAction,
} from "@/app/admin/desks/actions";
import { SpacesReservationSectionShell } from "@/app/admin/_components/spaces-reservation-section";
import { AdminDeskForm } from "@/app/admin/desks/admin-desk-form";
import { DeleteBuildingButton } from "@/app/admin/desks/delete-building-button";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

const inputClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-slate-900 outline-none ring-offset-background transition placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring";

function StatusPill({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {children}
    </span>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

export default async function AdminBuildingsPage() {
  await requireRole([UserRole.ADMIN]);
  const buildings = await db.building.findMany({
    where: { deletedAt: null, isTransitional: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      active: true,
      id: true,
      name: true,
      sortOrder: true,
      _count: {
        select: {
          desks: true,
          lunchReservations: true,
          resourcePools: true,
        },
      },
    },
  });
  const activeCount = buildings.filter((building) => building.active).length;
  const defaultSortOrder =
    buildings.reduce(
      (highest, building) => Math.max(highest, building.sortOrder),
      0,
    ) + 1;

  return (
    <SpacesReservationSectionShell>
      <PageHeader
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/desks">
              <LayoutGrid className="h-4 w-4" />
              میزها
            </Link>
          </Button>
        }
        subtitle="ساختمان‌ها مکان مشترک میزها، سیستم‌ها و تحویل غذا هستند؛ هر ساختمان را فقط یک‌بار تعریف کنید."
        title="ساختمان‌ها"
      />

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Plus className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">ساختمان جدید</h2>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                پس از ساخت، میزها و مجموعه‌های سیستم را به این ساختمان متصل کنید.
              </p>
            </div>
          </div>
        </div>
        <AdminDeskForm
          action={createBuildingAction}
          className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end"
          resetOnSuccess
        >
          <Field label="نام ساختمان">
            <input
              className={inputClass}
              maxLength={100}
              name="name"
              placeholder="مثلاً ساختمان مرکزی"
              required
            />
          </Field>
          <Field label="ترتیب نمایش">
            <input
              className={inputClass}
              defaultValue={defaultSortOrder}
              min={0}
              name="sortOrder"
              required
              type="number"
            />
          </Field>
          <SubmitButton className="w-full md:w-auto" pendingLabel="در حال ایجاد">
            <Plus className="h-4 w-4" />
            ایجاد ساختمان
          </SubmitButton>
        </AdminDeskForm>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">ساختمان‌های ثبت‌شده</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              نام، وضعیت و ترتیب نمایش ساختمان‌ها را از همین فهرست مدیریت کنید.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill active>{activeCount} فعال</StatusPill>
            <StatusPill>{buildings.length} ساختمان</StatusPill>
          </div>
        </div>

        {buildings.length === 0 ? (
          <div className="grid justify-items-center gap-3 px-5 py-12 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <Building2 className="h-6 w-6" />
            </span>
            <div>
              <p className="font-medium">هنوز ساختمانی تعریف نشده است.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                فرم بالا را تکمیل کنید تا اولین ساختمان ساخته شود.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {buildings.map((building) => (
              <article className="grid gap-4 p-5" key={building.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">{building.name}</h3>
                        <StatusPill active={building.active}>
                          {building.active ? "فعال" : "غیرفعال"}
                        </StatusPill>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {building._count.desks} میز · {building._count.resourcePools} مجموعه سیستم · {building._count.lunchReservations} رزرو غذا
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/desks?buildingId=${encodeURIComponent(building.id)}`}>
                      <LayoutGrid className="h-4 w-4" />
                      میزها و زمان‌بندی
                    </Link>
                  </Button>
                </div>

                <AdminDeskForm
                  action={updateBuildingAction}
                  className="grid gap-4 rounded-lg bg-slate-50/70 p-4 lg:grid-cols-[minmax(0,1fr)_160px_220px_auto] lg:items-end"
                >
                  <input name="buildingId" type="hidden" value={building.id} />
                  <Field label="نام ساختمان">
                    <input
                      className={inputClass}
                      defaultValue={building.name}
                      name="name"
                      required
                    />
                  </Field>
                  <Field label="ترتیب نمایش">
                    <input
                      className={inputClass}
                      defaultValue={building.sortOrder}
                      min={0}
                      name="sortOrder"
                      required
                      type="number"
                    />
                  </Field>
                  <label className="flex h-11 items-center justify-between gap-4 rounded-md border bg-background px-3 text-sm font-medium text-slate-700">
                    ساختمان فعال
                    <input
                      className="h-4 w-4 accent-primary"
                      defaultChecked={building.active}
                      name="active"
                      type="checkbox"
                    />
                  </label>
                  <SubmitButton className="w-full lg:w-auto" pendingLabel="در حال ذخیره">
                    <Save className="h-4 w-4" />
                    ذخیره
                  </SubmitButton>
                </AdminDeskForm>

                <div className="flex justify-end">
                  <DeleteBuildingButton
                    action={deleteBuildingAction}
                    buildingId={building.id}
                    buildingName={building.name}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </SpacesReservationSectionShell>
  );
}
