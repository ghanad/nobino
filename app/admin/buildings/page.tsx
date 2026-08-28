import { UserRole } from "@prisma/client";
import { Building2 } from "lucide-react";

import { SpacesReservationSectionShell } from "@/app/admin/_components/spaces-reservation-section";
import { CreateBuildingSection, BuildingList } from "@/app/admin/buildings/_components/building-list";
import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Shared presentation helpers (server-compatible)                    */
/* ------------------------------------------------------------------ */

function StatusPill({
  children,
  active = false,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500",
      )}
    >
      {children}
    </span>
  );
}

const panelClass = "overflow-hidden rounded-xl border bg-card shadow-sm";
const panelHeaderClass =
  "flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between";

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

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
        subtitle="ساختمان‌ها مکان مشترک میزها، سیستم‌ها و تحویل غذا هستند؛ هر ساختمان را فقط یک‌بار تعریف کنید."
        title="ساختمان‌ها"
      />

      <CreateBuildingSection defaultSortOrder={defaultSortOrder} />

      <section className={panelClass}>
        <div className={panelHeaderClass}>
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
                از بخش «ساختمان جدید» اولین ساختمان را ایجاد کنید.
              </p>
            </div>
          </div>
        ) : (
          <BuildingList buildings={buildings} />
        )}
      </section>
    </SpacesReservationSectionShell>
  );
}