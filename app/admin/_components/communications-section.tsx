"use client";

import type { ReactNode } from "react";

import { AdminSectionShell } from "./admin-section-shell";

const items = [
  { href: "/admin/announcements", label: "اعلان‌ها", icon: "megaphone" },
  { href: "/admin/bale", label: "پیام‌رسان بله", icon: "message" },
] as const;

export function CommunicationsSectionShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AdminSectionShell
      items={items.map((item) => ({ ...item, key: item.href }))}
      navLabel="بخش‌های ارتباطات"
      subtitle="مدیریت اعلان‌های عمومی و ارتباطات پیام‌رسان بله"
      title="ارتباطات"
    >
      {children}
    </AdminSectionShell>
  );
}
