"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu } from "lucide-react";

import { logoutAction } from "@/app/login/actions";
import { cn } from "@/lib/utils";

export type GlobalNavItem = {
  href: string;
  label: string;
  match: "exact" | "prefix";
};

type GlobalNavProps = {
  navItems: GlobalNavItem[];
  unreadNotificationCount: number;
  userName: string | null;
};

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

function isActiveNavItem(pathname: string, item: GlobalNavItem): boolean {
  if (item.match === "exact") {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({
  item,
  pathname,
  unreadNotificationCount,
}: {
  item: GlobalNavItem;
  pathname: string;
  unreadNotificationCount: number;
}) {
  const isActive = isActiveNavItem(pathname, item);
  const showUnreadCount =
    item.href === "/notifications" && unreadNotificationCount > 0;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-sm font-medium transition-colors",
        isActive
          ? "border-slate-200 bg-slate-100 text-slate-950"
          : "border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-950",
      )}
      href={item.href}
    >
      {item.href === "/notifications" ? <Bell className="h-4 w-4" /> : null}
      <span>{item.label}</span>
      {showUnreadCount ? (
        <span
          aria-label={`${PERSIAN_NUMBER_FORMATTER.format(unreadNotificationCount)} اعلان خوانده‌نشده`}
          className="min-w-4 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white"
        >
          {PERSIAN_NUMBER_FORMATTER.format(unreadNotificationCount)}
        </span>
      ) : null}
    </Link>
  );
}

function UserMenu({ userName }: { userName: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={cn(
          "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border bg-background px-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950",
          isOpen
            ? "border-slate-200 bg-slate-50 text-slate-950"
            : "border-transparent",
        )}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="max-w-32 truncate">{userName ?? "حساب کاربری"}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-slate-500 transition-transform",
            isOpen ? "rotate-180" : "",
          )}
        />
      </button>
      {isOpen ? (
        <div
          className="absolute left-0 z-20 mt-1.5 w-36 rounded-md border border-slate-200 bg-card p-1 text-card-foreground shadow-sm"
          role="menu"
        >
          <form action={logoutAction}>
            <button
              className="inline-flex h-8 w-full items-center justify-start gap-1.5 rounded-sm px-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
              role="menuitem"
              type="submit"
            >
              <LogOut className="h-3.5 w-3.5" />
              خروج
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function GlobalNav({
  navItems,
  unreadNotificationCount,
  userName,
}: GlobalNavProps) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          className="shrink-0 text-sm font-semibold tracking-normal text-slate-950"
          href="/reservations"
        >
          Nobino Reservations
        </Link>

        <nav
          aria-label="ناوبری اصلی"
          className="hidden min-w-0 flex-1 items-center justify-start gap-1.5 md:flex"
        >
          {navItems.map((item) => (
            <NavLink
              item={item}
              key={item.href}
              pathname={pathname}
              unreadNotificationCount={unreadNotificationCount}
            />
          ))}
        </nav>

        <div className="hidden shrink-0 md:block">
          <UserMenu userName={userName} />
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <UserMenu userName={userName} />
        </div>
      </div>

      <details className="group md:hidden">
        <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border border-slate-200 bg-background px-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 [&::-webkit-details-marker]:hidden">
          <Menu className="h-4 w-4" />
          منو
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <nav
          aria-label="ناوبری اصلی"
          className="mt-3 grid gap-2 rounded-lg border bg-background p-2"
        >
          {navItems.map((item) => (
            <NavLink
              item={item}
              key={item.href}
              pathname={pathname}
              unreadNotificationCount={unreadNotificationCount}
            />
          ))}
        </nav>
      </details>
    </div>
  );
}
