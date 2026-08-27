import { UserRole } from "@prisma/client";
import { SpacesReservationSectionShell } from "@/app/admin/_components/spaces-reservation-section";
import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
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
    view?: string;
  }>;
};

type SystemReservationsView = "capacity" | "policy";

function parseSystemReservationsView(value?: string): SystemReservationsView {
  return value === "policy" ? "policy" : "capacity";
}

export default async function AdminCapacityPage({
  searchParams,
}: AdminCapacityPageProps) {
  await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const activeView = parseSystemReservationsView(params?.view);
  const toast = getAdminToast(params);
  const [resourcePools, buildings, capacityExceptions, reservationPolicy] =
    await Promise.all([
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
    db.reservationPolicy.findUnique({
      where: { id: "default" },
      select: {
        autoAcceptDelayHours: true,
        autoAcceptEnabled: true,
        dailyUserHourLimit: true,
        oneReservationPerDayEnabled: true,
      },
    }),
  ]);

  const policyValues = reservationPolicy ?? {
    autoAcceptDelayHours: 4,
    autoAcceptEnabled: false,
    dailyUserHourLimit: 3,
    oneReservationPerDayEnabled: true,
  };

  return (
    <SpacesReservationSectionShell>
      <PageHeader
        subtitle="ظرفیت، استثناهای روزانه و قواعد تأیید رزرو سیستم"
        title="رزرو سیستم"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <div className="grid min-w-0 gap-6">
          {activeView === "capacity" ? (
            <>
              <ResourcePoolSettings
                buildings={buildings}
                resourcePools={resourcePools}
              />
              <CapacityExceptions
                capacityExceptions={capacityExceptions}
                resourcePools={resourcePools}
              />
            </>
          ) : (
            <ReservationPolicySettings {...policyValues} />
          )}
      </div>
    </SpacesReservationSectionShell>
  );
}
