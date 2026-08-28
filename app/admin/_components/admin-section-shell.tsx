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
  User,
  Users,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  | "settings"
  | "user"
  | "users"
  | "users-round";

export type AdminSectionNavItem = {
  href: string;
  icon?: AdminSectionIcon;
  key: string;
  label: string;
  children?: ReadonlyArray<{
    href: string;
    key: string;
    label: string;
  }>;
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
  user: User,
  users: Users,
  "users-round": UsersRound,
} as const;

function NavItem({
  active,
  href,
  icon,
  label,
}: {
  active: boolean;
  href: string;
  icon?: AdminSectionIcon;
  label: string;
}) {
  const Icon = icon ? icons[icon] : null;

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 min-w-0 items-center justify-start gap-2 rounded-md border px-3 py-2 text-right text-sm font-medium leading-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active
          ? "border-border bg-card text-slate-950"
          : "border-transparent text-slate-600 hover:bg-card/70 hover:text-slate-950",
      )}
      href={href}
    >
      {Icon ? (
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

function getViewFromSearchParams(searchParams: URLSearchParams): string {
  const view = searchParams.get("view");
  return view === "schedule" || view === "exceptions" ? view : "details";
}

function getRoomIdFromSearchParams(searchParams: URLSearchParams): string | null {
  return searchParams.get("roomId");
}

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
  const searchParams = useSearchParams();
  const isMeetingRoomsPath = pathname === "/admin/meeting-rooms" || pathname.startsWith("/admin/meeting-rooms/");
  const currentRoomId = getRoomIdFromSearchParams(searchParams);
  const currentView = getViewFromSearchParams(searchParams);

  function meetingRoomsSubHref(view: string) {
    const params = new URLSearchParams();
    if (currentRoomId) params.set("roomId", currentRoomId);
    params.set("view", view);
    return `/admin/meeting-rooms?${params.toString()}`;
  }

  return (
    <div className="grid gap-6" dir="rtl">
      <PageHeader subtitle={subtitle} title={title} />
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-lg border bg-muted/20 p-2 lg:sticky lg:top-8">
          <nav aria-label={navLabel}>
            <div className="grid min-w-0 grid-cols-2 gap-1 lg:grid-cols-1">
              {items.map((item) => {
                const hasNested = item.children && item.children.length > 0;
                const isActive = activeKey
                  ? item.key === activeKey
                  : isPathActive(pathname, item.href);
                const isExpanded = hasNested && isMeetingRoomsPath && item.href === "/admin/meeting-rooms";

                if (isExpanded && item.children) {
                  return (
                    <div className="lg:col-span-1" key={item.key}>
                      <NavItem
                        active={isActive}
                        href={item.href}
                        icon={item.icon}
                        label={item.label}
                      />
                      <div className="mr-2 mt-0.5 grid gap-0.5">
                        {item.children.map((child) => {
                          const childActive = child.key === `meeting-rooms-${currentView}`;

                          const resolvedHref = (() => {
                            if (child.key === "meeting-rooms-details") return meetingRoomsSubHref("details");
                            if (child.key === "meeting-rooms-schedule") return meetingRoomsSubHref("schedule");
                            if (child.key === "meeting-rooms-exceptions") return meetingRoomsSubHref("exceptions");
                            return child.href;
                          })();

                          return (
                            <Link
                              aria-current={childActive ? "page" : undefined}
                              className={cn(
                                "flex h-9 min-w-0 items-center justify-start gap-2 rounded-md border px-3 py-1.5 text-right text-xs leading-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                childActive
                                  ? "border-border bg-card text-slate-900 font-medium"
                                  : "border-transparent text-slate-500 hover:bg-card/50 hover:text-slate-800",
                              )}
                              href={resolvedHref}
                              key={child.key}
                            >
                              <span className="min-w-0 truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                return (
                  <NavItem
                    active={isActive}
                    href={item.href}
                    icon={item.icon}
                    key={item.key}
                    label={item.label}
                  />
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
