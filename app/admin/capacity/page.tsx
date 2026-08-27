import { UserRole } from "@prisma/client";
import { Gauge, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

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
import { cn } from "@/lib/utils";

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

function SystemReservationsRail({
  activeView,
}: {
  activeView: SystemReservationsView;
}) {
  const items = [
    {
      icon: Gauge,
      label: "ظرفیت و استثناها",
      shortLabel: "ظرفیت",
      value: "capacity" as const,
    },
    {
      icon: SlidersHorizontal,
      label: "سیاست رزرو",
      shortLabel: "سیاست رزرو",
      value: "policy" as const,
    },
  ];

  return (
    <aside className="flex flex-col rounded-lg border bg-muted/20 p-3 sm:p-5 lg:sticky lg:top-8">
      <nav aria-label="بخش‌های مدیریت رزرو سیستم">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:grid-cols-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.value === activeView;
            const href =
              item.value === "capacity"
                ? "/admin/capacity"
                : "/admin/capacity?view=policy";

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-center text-xs font-medium transition-colors lg:min-h-12 lg:justify-start lg:px-4 lg:text-sm",
                  isActive
                    ? "border-border bg-card text-slate-950 shadow-sm"
                    : "border-transparent text-slate-600 hover:bg-card/60 hover:text-slate-950",
                )}
                href={href}
                key={item.value}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate lg:hidden">
                  {item.shortLabel}
                </span>
                <span className="hidden min-w-0 truncate lg:inline">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
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
    <div className="grid gap-6" dir="rtl">
      <PageHeader
        subtitle="ظرفیت، استثناهای روزانه و قواعد تأیید درخواست‌های رزرو سیستم"
        title="مدیریت رزرو سیستم"
      />

      {toast ? <UrlToast {...toast} /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
        <SystemReservationsRail activeView={activeView} />

        <main className="grid min-w-0 gap-6">
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
        </main>
      </div>
    </div>
  );
}
