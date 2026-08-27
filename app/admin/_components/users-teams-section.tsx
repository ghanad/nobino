"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";

type UsersTeamsSection = "users" | "teams";

function resolveSection(pathname: string): UsersTeamsSection {
  if (pathname.startsWith("/admin/teams")) return "teams";
  return "users";
}

function UsersTeamsRail() {
  const pathname = usePathname();
  const activeSection = resolveSection(pathname);

  const items = [
    { href: "/admin/users", label: "کاربران", value: "users" as const },
    { href: "/admin/teams", label: "تیم‌ها", value: "teams" as const },
  ];

  return (
    <aside className="flex flex-col rounded-lg border bg-muted/20 p-3 sm:p-5 lg:sticky lg:top-8">
      <nav aria-label="بخش‌های کاربران و تیم‌ها">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:grid-cols-1">
          {items.map((item) => {
            const isActive = item.value === activeSection;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-center text-xs font-medium transition-colors lg:min-h-12 lg:justify-start lg:px-4 lg:text-sm",
                  isActive
                    ? "border-border bg-card text-slate-950 shadow-sm"
                    : "border-transparent text-slate-600 hover:bg-card/60 hover:text-slate-950",
                )}
                href={item.href}
                key={item.value}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

export function UsersTeamsSectionShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid gap-6" dir="rtl">
      <PageHeader
        subtitle="مدیریت کاربران، نقش‌ها، تیم‌ها و عضویت‌ها"
        title="کاربران و تیم‌ها"
      />
      <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <UsersTeamsRail />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
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
