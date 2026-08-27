"use client";

import {
  Building2,
  CalendarClock,
  DoorOpen,
  Gauge,
  LayoutGrid,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin/capacity", label: "مدیریت رزرو سیستم", icon: Gauge },
  { href: "/admin/meeting-rooms", label: "اتاق‌های جلسه", icon: DoorOpen },
  { href: "/admin/buildings", label: "ساختمان‌ها", icon: Building2 },
  { href: "/admin/desks", label: "میزها", icon: LayoutGrid },
  { href: "/admin/calendar", label: "زمان‌بندی", icon: CalendarClock },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SpacesReservationSectionShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="grid gap-6" dir="rtl">
      <PageHeader
        subtitle="مدیریت فضاها، ظرفیت رزرو و زمان‌بندی سرویس‌های مشترک"
        title="فضاها و رزرو"
      />
      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-lg border bg-muted/20 p-2 sm:p-3 lg:sticky lg:top-8">
          <nav aria-label="بخش‌های فضاها و رزرو">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;

                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md border px-2 py-2 text-center text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 lg:min-h-12 lg:justify-start lg:px-4 lg:text-sm",
                      active
                        ? "border-border bg-card text-slate-950 shadow-sm"
                        : "border-transparent text-slate-600 hover:bg-card/60 hover:text-slate-950",
                    )}
                    href={item.href}
                    key={item.href}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
