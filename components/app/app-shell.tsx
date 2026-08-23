import type { ReactNode } from "react";

import { GlobalNav, type GlobalNavItem } from "@/components/app/global-nav";
import { ProductSignature } from "@/components/app/product-signature";
import { AnnouncementModal } from "@/components/ui/announcement-modal";
import { UnreadNotificationToast } from "@/components/ui/unread-notification-toast";
import type { CurrentUser } from "@/lib/auth";
import { getPendingAnnouncementForUser } from "@/lib/announcement-service";
import {
  getLatestUnreadNotification,
  getRecentNotificationsForNav,
  getUnreadNotificationCount,
} from "@/lib/notification-service";
import {
  canAccessAdminArea,
  canAccessLunchReport,
  canAccessManagerArea,
} from "@/lib/permissions";

type AppShellProps = {
  user: CurrentUser;
  children: ReactNode;
};

function getNavItems(user: CurrentUser): GlobalNavItem[] {
  const canViewLunchReport = canAccessLunchReport(user);
  const lunchReportItem: GlobalNavItem = {
    href: "/lunch/report",
    label: "گزارش غذا",
    match: "prefix",
  };
  const navItems: GlobalNavItem[] = [
    {
      children: [
        { href: "/desks", label: "میز کار", match: "prefix" },
        { href: "/meeting-rooms", label: "اتاق جلسه", match: "prefix" },
        { href: "/reservations", label: "رزرو سیستم", match: "exact" },
      ],
      href: "/reservations",
      label: "رزروها",
      match: "exact",
    },
    {
      children: [
        { href: "/lunch", label: "غذا", match: "exact" },
        ...(canViewLunchReport ? [lunchReportItem] : []),
        { href: "/surveys", label: "نظرسنجی‌ها", match: "prefix" },
      ],
      href: "/",
      label: "خدمات",
      match: "exact",
    },
    {
      children: [{ href: "/wiki", label: "دانشنامه", match: "prefix" }],
      href: "/wiki",
      label: "منابع",
      match: "prefix",
    },
  ];

  if (canAccessManagerArea(user.role)) {
    navItems.push({
      href: "/manager",
      label: "بررسی درخواست‌ها",
      match: "prefix",
      children: [
        { href: "/manager", label: "تقویم رزروها", match: "exact" },
        {
          href: "/manager/meeting-rooms",
          label: "اتاق‌های جلسه",
          match: "prefix",
        },
        { href: "/manager/desks", label: "میزهای کار", match: "prefix" },
        {
          href: "/manager/team-report",
          label: "گزارش تیم‌ها",
          match: "prefix",
        },
        {
          href: "/manager/desk-report",
          label: "گزارش میزها",
          match: "prefix",
        },
      ],
    });
  }

  if (canAccessAdminArea(user.role)) {
    navItems.push(
      {
        href: "/admin",
        label: "مدیریت",
        match: "exact",
        children: [
          { href: "/admin", label: "کاربران", match: "exact" },
          { href: "/admin/teams", label: "تیم‌ها", match: "prefix" },
          { href: "/admin/capacity", label: "ظرفیت", match: "prefix" },
          {
            href: "/admin/reservation-policy",
            label: "سیاست رزرو",
            match: "prefix",
          },
          {
            href: "/admin/calendar",
            label: "تقویم عملیاتی",
            match: "prefix",
          },
          { href: "/admin/schedule", label: "زمان‌بندی", match: "prefix" },
          {
            href: "/admin/meeting-rooms",
            label: "اتاق‌های جلسه",
            match: "prefix",
          },
          { href: "/admin/buildings", label: "ساختمان‌ها", match: "prefix" },
          { href: "/admin/desks", label: "میزها و زمان‌بندی", match: "prefix" },
          { href: "/admin/lunch", label: "غذا", match: "prefix" },
          {
            href: "/admin/lunch-notifications",
            label: "ارسال گزارش غذا",
            match: "prefix",
          },
          { href: "/admin/announcements", label: "اعلان‌ها", match: "prefix" },
          { href: "/admin/bale", label: "پیام‌رسان بله", match: "prefix" },
          {
            href: "/admin/wiki-ai",
            label: "دستیار دانش‌نامه",
            match: "prefix",
          },
        ],
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
  const [
    unreadNotificationCount,
    latestUnreadNotification,
    pendingAnnouncement,
    recentNotifications,
  ] = await Promise.all([
    getUnreadNotificationCount(user.id),
    getLatestUnreadNotification(user.id),
    getPendingAnnouncementForUser({ role: user.role, userId: user.id }),
    getRecentNotificationsForNav(user.id),
  ]);

  return (
    <main className="flex min-h-screen flex-col overflow-x-clip bg-background">
      <AnnouncementModal announcement={pendingAnnouncement} />
      <UnreadNotificationToast notification={latestUnreadNotification} />
      <header className="sticky top-0 z-40 border-b bg-card md:static" dir="rtl">
        <GlobalNav
          navItems={getNavItems(user)}
          recentNotifications={recentNotifications}
          unreadNotificationCount={unreadNotificationCount}
          userName={user.name}
        />
      </header>
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </div>
      <footer className="mx-auto w-full max-w-7xl px-4 pb-8 pt-2 sm:px-6">
        <ProductSignature />
      </footer>
    </main>
  );
}
