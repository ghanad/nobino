"use client";

import type { ReactNode } from "react";

import { AdminSectionShell } from "./admin-section-shell";

export function WikiAiSectionShell({ children }: { children: ReactNode }) {
  return (
    <AdminSectionShell
      contentClassName="grid min-w-0 gap-5"
      items={[
        {
          href: "/admin/wiki-ai",
          icon: "message",
          key: "wiki-ai",
          label: "دستیار دانش‌نامه",
        },
      ]}
      navLabel="بخش‌های دستیار دانش‌نامه"
      subtitle="اتصال دستیار دانش‌نامه به مدل سازگار با OpenAI در شبکه داخلی"
      title="دستیار دانش‌نامه"
    >
      {children}
    </AdminSectionShell>
  );
}
