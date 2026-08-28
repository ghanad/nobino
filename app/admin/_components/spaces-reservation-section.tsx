"use client";

import type { ReactNode } from "react";

import { AdminSectionShell } from "./admin-section-shell";

const items = [
  { href: "/admin/capacity", label: "رزرو سیستم", icon: "gauge" },
  {
    href: "/admin/meeting-rooms",
    label: "اتاق‌های جلسه",
    icon: "door",
    children: [
      { href: "/admin/meeting-rooms", key: "meeting-rooms-details", label: "اطلاعات اتاق" },
      { href: "/admin/meeting-rooms?view=schedule", key: "meeting-rooms-schedule", label: "برنامه هفتگی" },
      { href: "/admin/meeting-rooms?view=exceptions", key: "meeting-rooms-exceptions", label: "استثناهای تقویم" },
    ],
  },
  { href: "/admin/buildings", label: "ساختمان‌ها", icon: "building" },
  {
    href: "/admin/desks",
    label: "میزها",
    icon: "grid",
    children: [
      { href: "/admin/desks", key: "desks-list", label: "میزها" },
      { href: "/admin/desks?view=schedule", key: "desks-schedule", label: "برنامه هفتگی" },
      { href: "/admin/desks?view=exceptions", key: "desks-exceptions", label: "استثناهای تقویم" },
      { href: "/admin/desks?view=policy", key: "desks-policy", label: "سیاست رزرو میز" },
    ],
  },
  {
    href: "/admin/calendar",
    label: "تقویم و تعطیلی‌ها",
    icon: "calendar",
    children: [
      { href: "/admin/calendar", key: "calendar-special-days", label: "روزهای خاص" },
      { href: "/admin/calendar?view=exceptions", key: "calendar-holidays", label: "تعطیلات رسمی" },
      { href: "/admin/calendar?view=weekly", key: "calendar-weekly", label: "برنامه هفتگی" },
    ],
  },
] as const;

export function SpacesReservationSectionShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AdminSectionShell
      items={items.map((item) => ({ ...item, key: item.href }))}
      navLabel="بخش‌های فضاها و رزرو"
      subtitle="فضاها، ظرفیت رزرو و زمان‌بندی سرویس‌های مشترک"
      title="فضاها و رزرو"
    >
      {children}
    </AdminSectionShell>
  );
}
