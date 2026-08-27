"use client";

import {
  Building2,
  CalendarClock,
  DoorOpen,
  Gauge,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";

export type AdminSectionIcon =
  | "building"
  | "calendar"
  | "door"
  | "gauge"
  | "grid"
  | "megaphone"
  | "message"
  | "settings";

export type AdminSectionNavItem = {
  href: string;
  icon?: AdminSectionIcon;
  key: string;
  label: string;
};

type AdminSectionShellProps = {
  activeKey?: string;
  children: ReactNode;
  contentClassName?: string;
  items: readonly AdminSectionNavItem[];
  navLabel: string;
  subtitle: string;
  title: string;
};

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const icons = {
  building: Building2,
  calendar: CalendarClock,
  door: DoorOpen,
  gauge: Gauge,
  grid: LayoutGrid,
  megaphone: Megaphone,
  message: MessageCircle,
  settings: Settings2,
} as const;

export function AdminSectionShell({
  activeKey,
  children,
  contentClassName = "grid min-w-0 gap-6",
  items,
  navLabel,
  subtitle,
  title,
}: AdminSectionShellProps) {
  const pathname = usePathname();

  return (
    <div className="grid gap-6" dir="rtl">
      <PageHeader subtitle={subtitle} title={title} />
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-lg border bg-muted/20 p-2 lg:sticky lg:top-8">
          <nav aria-label={navLabel}>
            <div className="grid min-w-0 grid-cols-2 gap-1 lg:grid-cols-1">
              {items.map((item) => {
                const Icon = item.icon ? icons[item.icon] : null;
                const active = activeKey
                  ? item.key === activeKey
                  : isPathActive(pathname, item.href);

                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 min-w-0 items-center justify-start gap-2 rounded-md border px-3 py-2 text-right text-sm font-medium leading-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      active
                        ? "border-border bg-card text-slate-950"
                        : "border-transparent text-slate-600 hover:bg-card/70 hover:text-slate-950",
                    )}
                    href={item.href}
                    key={item.key}
                  >
                    {Icon ? (
                      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    ) : null}
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </aside>
        <main className={cn("min-w-0", contentClassName)}>{children}</main>
      </div>
    </div>
  );
}
