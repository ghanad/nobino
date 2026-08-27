"use client";

import type { ReactNode } from "react";

import { AdminSectionShell } from "./admin-section-shell";

export function UsersTeamsSectionShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AdminSectionShell
      items={[
        {
          href: "/admin/users",
          icon: "users",
          key: "users",
          label: "کاربران",
        },
        {
          href: "/admin/teams",
          icon: "users-round",
          key: "teams",
          label: "تیم‌ها",
        },
      ]}
      navLabel="بخش‌های کاربران و تیم‌ها"
      subtitle="مدیریت کاربران، نقش‌ها، تیم‌ها و عضویت‌ها"
      title="کاربران و تیم‌ها"
      contentClassName="min-w-0"
    >
      {children}
    </AdminSectionShell>
  );
}

export function UsersTeamsPageFrame({
  title,
  description,
  action,
  summary,
  children,
}: {
  title: string;
  description: string;
  action: ReactNode;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-5 text-card-foreground" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>

      {summary}

      <div className="grid gap-3">{children}</div>
    </section>
  );
}
