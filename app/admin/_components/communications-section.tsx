"use client";

import { Megaphone, MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin/announcements", label: "اعلان‌ها", icon: Megaphone },
  { href: "/admin/bale", label: "پیام‌رسان بله", icon: MessageCircle },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CommunicationsSectionShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="grid gap-6" dir="rtl">
      <PageHeader
        subtitle="مدیریت اعلان‌های عمومی و ارتباطات پیام‌رسان بله"
        title="ارتباطات"
      />
      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-lg border bg-muted/20 p-2 lg:sticky lg:top-8">
          <nav aria-label="بخش‌های ارتباطات">
            <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;

                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md border px-2.5 py-2 text-center text-xs font-medium leading-5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-11 lg:justify-start lg:px-3 lg:text-sm",
                      active
                        ? "border-border bg-card text-slate-950"
                        : "border-transparent text-slate-600 hover:bg-card/70 hover:text-slate-950",
                    )}
                    href={item.href}
                    key={item.href}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </aside>
        <main className="grid min-w-0 gap-6">{children}</main>
      </div>
    </div>
  );
}
