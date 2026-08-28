import { UserRole } from "@prisma/client";
import { Building2 } from "lucide-react";

import { SpacesReservationSectionShell } from "@/app/admin/_components/spaces-reservation-section";
import { CreateBuildingSection, BuildingList } from "@/app/admin/buildings/_components/building-list";
import { PageHeader } from "@/components/app/page-header";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

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
  const inactiveCount = buildings.length - activeCount;
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

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">ساختمان‌های ثبت‌شده</h2>
            <span className="text-xs text-muted-foreground">
              {buildings.length} ساختمان{buildings.length > 0 && inactiveCount > 0 ? ` · ${activeCount} فعال` : ""}
            </span>
          </div>
        </div>

        {buildings.length === 0 ? (
          <div className="grid justify-items-center gap-3 px-4 py-12 text-center">
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