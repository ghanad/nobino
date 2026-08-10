import { UserRole } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ADMIN_PAGE_LABELS,
  CapacityExceptions,
  getAdminToast,
  ResourcePoolSettings,
} from "@/app/admin/_sections";

type AdminCapacityPageProps = {
  searchParams?: Promise<{
    error?: string;
    capacityExceptionCreated?: string;
    capacityExceptionDeleted?: string;
    capacityExceptionUpdated?: string;
    poolUpdated?: string;
  }>;
};

export default async function AdminCapacityPage({
  searchParams,
}: AdminCapacityPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getAdminToast(params);
  const [resourcePools, buildings, capacityExceptions] = await Promise.all([
    db.resourcePool.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        capacity: true,
        active: true,
        building: {
          select: {
            id: true,
            isTransitional: true,
            name: true,
          },
        },
      },
    }),
    db.building.findMany({
      where: { active: true, deletedAt: null, isTransitional: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
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
        subtitle="تنظیم ظرفیت پایه سیستم‌ها و استثناهای ظرفیت روزانه"
        title={ADMIN_PAGE_LABELS.capacity}
      />

      {toast ? <UrlToast {...toast} /> : null}
      <ResourcePoolSettings buildings={buildings} resourcePools={resourcePools} />
      <CapacityExceptions
        capacityExceptions={capacityExceptions}
        resourcePools={resourcePools}
      />
    </div>
  );
}
