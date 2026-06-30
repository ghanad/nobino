"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu, Settings, X } from "lucide-react";

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

type MobileNavEntry = {
  item: GlobalNavItem;
  label?: string;
};

type MobileNavSection = {
  entries: MobileNavEntry[];
  id: string;
  label?: string;
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

function getMobileNavSections(navItems: GlobalNavItem[]): MobileNavSection[] {
  const sections: MobileNavSection[] = [];
  const reservationsItem = navItems.find((item) => item.href === "/reservations");
  const meetingRoomsItem = navItems.find((item) => item.href === "/meeting-rooms");
  const lunchItem = navItems.find((item) => item.href === "/lunch");
  const managerItem = navItems.find((item) => item.href === "/manager");
  const adminItem = navItems.find((item) => item.href === "/admin");
  const auditItem = navItems.find((item) => item.href === "/admin/audit");

  if (reservationsItem) {
    sections.push({
      entries: [{ item: reservationsItem }],
      id: "reservations",
    });
  }

  if (meetingRoomsItem) {
    sections.push({
      entries: [{ item: meetingRoomsItem }],
      id: "meeting-rooms",
    });
  }

  if (lunchItem?.children?.length) {
    sections.push({
      entries: lunchItem.children.map((child) => ({ item: child })),
      id: "lunch",
      label: "ناهار",
    });
  } else if (lunchItem) {
    sections.push({
      entries: [{ item: lunchItem, label: "رزرو ناهار" }],
      id: "lunch",
    });
  }

  if (managerItem) {
    sections.push({
      entries: managerItem.children?.length
        ? managerItem.children.map((child) => ({ item: child }))
        : [{ item: managerItem }],
      id: "requests",
      label: "درخواست‌ها",
    });
  }

  if (adminItem?.children?.length) {
    sections.push({
      entries: adminItem.children.map((child) => ({
        item: child,
        label: child.href === "/admin/lunch" ? "تنظیمات ناهار" : child.label,
      })),
      id: "management",
      label: "مدیریت",
    });
  }

  if (auditItem) {
    sections.push({
      entries: [{ item: auditItem }],
      id: "reports",
      label: "گزارش‌ها",
    });
  }

  sections.push({
    entries: [
      {
        item: {
          href: "/notifications",
          label: "اعلان‌ها",
          match: "prefix",
        },
      },
    ],
    id: "notifications",
  });

  return sections;
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
          className="absolute left-0 z-20 mt-1.5 w-44 rounded-md border border-slate-200 bg-card p-1 text-card-foreground shadow-sm"
          role="menu"
        >
          <Link
            className="inline-flex h-8 w-full items-center justify-start gap-1.5 rounded-sm px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
            href="/settings/bale"
            onClick={() => setIsOpen(false)}
            role="menuitem"
          >
            <Settings className="h-3.5 w-3.5" />
            تنظیمات اعلان بله
          </Link>
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

function MobileDrawerLink({
  entry,
  onNavigate,
  pathname,
}: {
  entry: MobileNavEntry;
  onNavigate: () => void;
  pathname: string;
}) {
  const isActive = isActiveNavItem(pathname, entry.item);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center rounded-md border border-transparent border-r-2 px-3 text-[15px] font-medium transition-colors",
        isActive
          ? "border-r-primary bg-primary/5 text-slate-950"
          : "border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-950",
      )}
      href={entry.item.href}
      onClick={onNavigate}
    >
      {entry.label ?? entry.item.label}
    </Link>
  );
}

function MobileDrawerSection({
  isOpen,
  onNavigate,
  pathname,
  section,
  onToggle,
}: {
  isOpen: boolean;
  onNavigate: () => void;
  onToggle: (sectionId: string) => void;
  pathname: string;
  section: MobileNavSection;
}) {
  const hasLabel = Boolean(section.label);

  if (!hasLabel) {
    return (
      <div className="grid gap-1">
        {section.entries.map((entry) => (
          <MobileDrawerLink
            entry={entry}
            key={entry.item.href}
            onNavigate={onNavigate}
            pathname={pathname}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="grid gap-1">
      <button
        aria-expanded={isOpen}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-right text-[15px] font-semibold text-slate-800 transition-colors hover:bg-slate-50"
        onClick={() => onToggle(section.id)}
        type="button"
      >
        <span>{section.label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-500 transition-transform",
            isOpen ? "rotate-180" : "",
          )}
        />
      </button>
      {isOpen ? (
        <div className="grid gap-1 border-r border-slate-200 pr-3">
          {section.entries.map((entry) => (
            <MobileDrawerLink
              entry={entry}
              key={entry.item.href}
              onNavigate={onNavigate}
              pathname={pathname}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function getDefaultOpenMobileSectionIds(
  pathname: string,
  sections: MobileNavSection[],
): Set<string> {
  return new Set(
    sections
      .filter(
        (section) =>
          Boolean(section.label) &&
          section.entries.some((entry) => isActiveNavItem(pathname, entry.item)),
      )
      .map((section) => section.id),
  );
}

function MobileDrawer({
  isOpen,
  navItems,
  onClose,
  pathname,
  userName,
}: {
  isOpen: boolean;
  navItems: GlobalNavItem[];
  onClose: () => void;
  pathname: string;
  userName: string | null;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const sections = useMemo(() => getMobileNavSections(navItems), [navItems]);
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(() =>
    getDefaultOpenMobileSectionIds(pathname, sections),
  );

  useEffect(() => {
    setOpenSectionIds(getDefaultOpenMobileSectionIds(pathname, sections));
  }, [pathname, sections]);

  const toggleSection = useCallback((sectionId: string) => {
    setOpenSectionIds((current) => {
      const next = new Set(current);

      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }

      return next;
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div
      aria-hidden={!isOpen}
      className={cn("fixed inset-0 z-50 md:hidden", isOpen ? "" : "pointer-events-none")}
      inert={!isOpen}
    >
      <button
        aria-label="بستن منوی ناوبری"
        className={cn(
          "absolute inset-0 cursor-default bg-slate-950/45 transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        tabIndex={isOpen ? 0 : -1}
        type="button"
      />
      <aside
        aria-label="منوی ناوبری موبایل"
        className={cn(
          "absolute right-0 top-0 flex h-[100dvh] w-[min(82vw,360px)] flex-col overflow-y-auto border-l border-slate-200 bg-card text-card-foreground shadow-xl outline-none transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
        id="mobile-navigation-drawer"
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
          <Link
            className="text-sm font-semibold tracking-normal text-slate-950"
            href="/"
            onClick={onClose}
          >
            Nobino
          </Link>
          <button
            aria-label="بستن منوی ناوبری"
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-transparent text-slate-700 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="ناوبری اصلی" className="grid gap-2.5 px-4 py-4">
          {sections.map((section) => (
            <MobileDrawerSection
              isOpen={!section.label || openSectionIds.has(section.id)}
              key={section.id}
              onNavigate={onClose}
              onToggle={toggleSection}
              pathname={pathname}
              section={section}
            />
          ))}
        </nav>

        <div className="mt-auto border-t px-4 py-3">
          <p className="truncate px-3 text-sm font-medium text-slate-950">
            {userName ?? "حساب کاربری"}
          </p>
          <Link
            className="mt-1.5 flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-[15px] font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
            href="/settings/bale"
            onClick={onClose}
          >
            <Settings className="h-4 w-4" />
            تنظیمات اعلان بله
          </Link>
          <form action={logoutAction} className="mt-1.5">
            <button
              className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-[15px] font-medium text-red-700 transition-colors hover:bg-red-50"
              type="submit"
            >
              <LogOut className="h-4 w-4" />
              خروج
            </button>
          </form>
        </div>
      </aside>
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
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasMobileDrawerOpenRef = useRef(false);

  const closeMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(false);
  }, []);

  useEffect(() => {
    setIsMobileDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileDrawerOpen && wasMobileDrawerOpenRef.current) {
      menuButtonRef.current?.focus();
    }
    wasMobileDrawerOpenRef.current = isMobileDrawerOpen;
  }, [isMobileDrawerOpen]);

  return (
    <div className="mx-auto flex h-16 w-full max-w-6xl flex-col justify-center px-4 md:h-auto md:gap-3 md:px-6 md:py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            className="text-sm font-semibold tracking-normal text-slate-950"
            href="/"
          >
            Nobino
          </Link>
          <button
            aria-controls="mobile-navigation-drawer"
            aria-expanded={isMobileDrawerOpen}
            aria-label="باز کردن منوی ناوبری"
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-transparent text-slate-700 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950 md:hidden"
            onClick={() => setIsMobileDrawerOpen(true)}
            ref={menuButtonRef}
            type="button"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

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
        </div>
      </div>

      <MobileDrawer
        isOpen={isMobileDrawerOpen}
        navItems={navItems}
        onClose={closeMobileDrawer}
        pathname={pathname}
        userName={userName}
      />
    </div>
  );
}
