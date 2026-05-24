import type { ReactNode } from "react";

import { GlobalNav, type GlobalNavItem } from "@/components/app/global-nav";
import { UnreadNotificationToast } from "@/components/ui/unread-notification-toast";
import type { CurrentUser } from "@/lib/auth";
import {
  getLatestUnreadNotification,
  getUnreadNotificationCount,
} from "@/lib/notification-service";
import { canAccessAdminArea, canAccessManagerArea } from "@/lib/permissions";

type AppShellProps = {
  user: CurrentUser;
  children: ReactNode;
};

function getNavItems(user: CurrentUser): GlobalNavItem[] {
  const navItems: GlobalNavItem[] = [
    { href: "/reservations", label: "رزروها", match: "prefix" },
    { href: "/notifications", label: "اعلان‌ها", match: "prefix" },
  ];

  if (canAccessManagerArea(user.role)) {
    navItems.push({
      href: "/manager",
      label: "بررسی درخواست‌ها",
      match: "prefix",
    });
  }

  if (canAccessAdminArea(user.role)) {
    navItems.push(
      {
        href: "/admin",
        label: "کاربران و سیستم‌ها",
        match: "exact",
      },
      {
        href: "/admin/audit",
        label: "گزارش فعالیت‌ها",
        match: "prefix",
      },
    );
  }

  return navItems;
}

export async function AppShell({ user, children }: AppShellProps) {
  const [unreadNotificationCount, latestUnreadNotification] = await Promise.all([
    getUnreadNotificationCount(user.id),
    getLatestUnreadNotification(user.id),
  ]);

  return (
    <main className="min-h-screen bg-background">
      <UnreadNotificationToast notification={latestUnreadNotification} />
      <header className="border-b bg-card" dir="rtl">
        <GlobalNav
          navItems={getNavItems(user)}
          unreadNotificationCount={unreadNotificationCount}
          userName={user.name}
        />
      </header>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        {children}
      </div>
    </main>
  );
}
