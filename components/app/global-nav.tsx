"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu } from "lucide-react";

import { logoutAction } from "@/app/login/actions";
import { cn } from "@/lib/utils";

export type GlobalNavItem = {
  children?: GlobalNavItem[];
  href: string;
  label: string;
  match: "exact" | "prefix";
};

type GlobalNavProps = {
  navItems: GlobalNavItem[];
  recentNotifications: NavNotification[];
  unreadNotificationCount: number;
  userName: string | null;
};

type NavNotification = {
  body: string;
  createdAtLabel: string;
  id: string;
  isUnread: boolean;
  title: string;
};

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

function isActiveNavItem(pathname: string, item: GlobalNavItem): boolean {
  if (item.children?.some((child) => isActiveNavItem(pathname, child))) {
    return true;
  }

  if (item.match === "exact") {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({
  enableDropdown = true,
  item,
  pathname,
}: {
  enableDropdown?: boolean;
  item: GlobalNavItem;
  pathname: string;
}) {
  const isActive = isActiveNavItem(pathname, item);
  const hasChildren = Boolean(item.children?.length);

  if (hasChildren && enableDropdown) {
    return (
      <div className="group relative">
        <Link
          aria-current={isActive ? "page" : undefined}
          aria-haspopup="menu"
          className={cn(
            "relative inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-sm font-medium transition-colors",
            isActive
              ? "border-slate-200 bg-slate-100 text-slate-950"
              : "border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-950",
          )}
          href={item.href}
        >
          <span>{item.label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" />
        </Link>
        <div className="invisible absolute right-0 top-full z-20 w-40 pt-1.5 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
          <div
            className="rounded-md border border-slate-200 bg-card p-1 text-card-foreground shadow-sm"
            role="menu"
          >
            {item.children?.map((child) => {
              const isChildActive = isActiveNavItem(pathname, child);

              return (
                <Link
                  aria-current={isChildActive ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center justify-start rounded-sm px-2 text-xs font-medium transition-colors",
                    isChildActive
                      ? "bg-slate-100 text-slate-950"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
                  )}
                  href={child.href}
                  key={child.href}
                  role="menuitem"
                >
                  {child.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

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
      <span>{item.label}</span>
    </Link>
  );
}

function NotificationLink({
  enablePopover,
  pathname,
  recentNotifications,
  unreadNotificationCount,
}: {
  enablePopover: boolean;
  pathname: string;
  recentNotifications: NavNotification[];
  unreadNotificationCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isActive =
    pathname === "/notifications" || pathname.startsWith("/notifications/");
  const unreadLabel =
    unreadNotificationCount > 0
      ? `${PERSIAN_NUMBER_FORMATTER.format(unreadNotificationCount)} اعلان خوانده‌نشده`
      : "اعلان‌ها";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        popoverRef.current &&
        event.target instanceof Node &&
        !popoverRef.current.contains(event.target)
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

  if (!enablePopover) {
    return (
      <Link
        aria-current={isActive ? "page" : undefined}
        aria-label={unreadLabel}
        className={cn(
          "relative inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
          isActive
            ? "border-slate-200 bg-slate-100 text-slate-950"
            : "border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-950",
        )}
        href="/notifications"
        title={unreadLabel}
      >
        <Bell className="h-4 w-4" />
        {unreadNotificationCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-white ring-2 ring-card">
            {PERSIAN_NUMBER_FORMATTER.format(unreadNotificationCount)}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        aria-current={isActive ? "page" : undefined}
        aria-expanded={isOpen}
        aria-label={unreadLabel}
        className={cn(
          "relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-colors",
          isActive || isOpen
            ? "border-slate-200 bg-slate-100 text-slate-950"
            : "border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-950",
        )}
        onClick={() => setIsOpen((current) => !current)}
        title={unreadLabel}
        type="button"
      >
        <Bell className="h-4 w-4" />
        {unreadNotificationCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-white ring-2 ring-card">
            {PERSIAN_NUMBER_FORMATTER.format(unreadNotificationCount)}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute left-0 z-30 mt-2 w-80 rounded-lg border border-slate-200 bg-card text-right text-card-foreground shadow-lg">
          <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div>
              <p className="text-sm font-medium">اعلان‌ها</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {unreadNotificationCount > 0
                  ? `${PERSIAN_NUMBER_FORMATTER.format(unreadNotificationCount)} خوانده‌نشده`
                  : "اعلان خوانده‌نشده‌ای ندارید"}
              </p>
            </div>
            <Link
              className="text-xs font-medium text-primary hover:underline"
              href="/notifications"
              onClick={() => setIsOpen(false)}
            >
              مشاهده همه
            </Link>
          </div>

          {recentNotifications.length > 0 ? (
            <div className="max-h-80 overflow-y-auto p-1">
              {recentNotifications.map((notification) => (
                <Link
                  className="block rounded-md px-3 py-2.5 transition-colors hover:bg-slate-50"
                  href="/notifications"
                  key={notification.id}
                  onClick={() => setIsOpen(false)}
                >
                  <div className="flex items-start gap-2">
                    {notification.isUnread ? (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-sky-600" />
                    ) : (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-transparent" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {notification.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                        {notification.createdAtLabel}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              اعلانی وجود ندارد.
            </div>
          )}
        </div>
      ) : null}
    </div>
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
  recentNotifications,
  unreadNotificationCount,
  userName,
}: GlobalNavProps) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          className="shrink-0 text-sm font-semibold tracking-normal text-slate-950"
          href="/"
        >
          Nobino
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
            />
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          <NotificationLink
            enablePopover
            pathname={pathname}
            recentNotifications={recentNotifications}
            unreadNotificationCount={unreadNotificationCount}
          />
          <UserMenu userName={userName} />
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <NotificationLink
            enablePopover={false}
            pathname={pathname}
            recentNotifications={recentNotifications}
            unreadNotificationCount={unreadNotificationCount}
          />
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
            <div className="grid gap-1" key={item.href}>
              <NavLink
                enableDropdown={false}
                item={item}
                pathname={pathname}
              />
              {item.children?.length ? (
                <div className="grid gap-1 border-r border-slate-200 pr-3">
                  {item.children.map((child) => (
                    <NavLink
                      enableDropdown={false}
                      item={child}
                      key={child.href}
                      pathname={pathname}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
      </details>
    </div>
  );
}
