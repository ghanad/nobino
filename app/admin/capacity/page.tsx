import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ADMIN_PAGE_LABELS,
  CapacityExceptions,
  getAdminToast,
  ReservationPolicySettings,
  ResourcePoolSettings,
} from "@/app/admin/_sections";

type AdminCapacityPageProps = {
  searchParams?: Promise<{
    error?: string;
    capacityExceptionCreated?: string;
    capacityExceptionDeleted?: string;
    capacityExceptionUpdated?: string;
    poolUpdated?: string;
    reservationPolicyUpdated?: string;
  }>;
};

export default async function AdminCapacityPage({
  searchParams,
}: AdminCapacityPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getAdminToast(params);
  const [resourcePools, reservationPolicy, capacityExceptions] =
    await Promise.all([
      db.resourcePool.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          capacity: true,
          active: true,
        },
      }),
      db.reservationPolicy.findUnique({
        where: { id: "default" },
        select: {
          dailyUserHourLimit: true,
          oneReservationPerDayEnabled: true,
        },
      }),
      db.resourcePoolCapacityException.findMany({
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          date: true,
          capacity: true,
          reason: true,
          resourcePool: {
            select: {
              id: true,
              name: true,
              capacity: true,
            },
          },
        },
      }),
    ]);

  return (
    <div className="grid gap-6">
      <PageHeader
        subtitle="تنظیم ظرفیت سیستم‌ها و محدودیت‌های رزرو"
        title={ADMIN_PAGE_LABELS.capacity}
      />

      {toast ? <UrlToast {...toast} /> : null}
      <ResourcePoolSettings resourcePools={resourcePools} />
      <ReservationPolicySettings
        dailyUserHourLimit={reservationPolicy?.dailyUserHourLimit ?? 3}
        oneReservationPerDayEnabled={
          reservationPolicy?.oneReservationPerDayEnabled ?? true
        }
      />
      <CapacityExceptions
        capacityExceptions={capacityExceptions}
        resourcePools={resourcePools}
      />
    </div>
  );
}
