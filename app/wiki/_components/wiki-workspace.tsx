"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getWikiPagePath } from "@/lib/wiki-route";
import type { WikiPageTreeNode } from "@/lib/wiki-service";
import { cn } from "@/lib/utils";

type WikiWorkspaceProps = {
  activeSlug: string;
  children: ReactNode;
  isAdmin: boolean;
  tree: WikiPageTreeNode[];
};

function WikiTreeBranch({
  activeSlug,
  isAdmin,
  level,
  node,
  onNavigate,
}: {
  activeSlug: string;
  isAdmin: boolean;
  level: number;
  node: WikiPageTreeNode;
  onNavigate?: () => void;
}) {
  const isActive = activeSlug === node.slug;

  return (
    <div className="grid gap-1">
      <Link
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center justify-between gap-3 rounded-md border border-transparent pr-3 text-right text-sm font-medium transition-colors",
          isActive
            ? "border-slate-200 bg-slate-100 text-slate-950"
            : "text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950",
          node.isHidden && isAdmin ? "opacity-70" : "",
        )}
        href={getWikiPagePath(node.slug)}
        onClick={onNavigate}
        style={{ paddingRight: 12 + level * 16 }}
      >
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
        {node.isHidden && isAdmin ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
            مخفی
          </span>
        ) : null}
      </Link>

      {node.children.length > 0 ? (
        <div className="grid gap-1">
          {node.children.map((child) => (
            <WikiTreeBranch
              activeSlug={activeSlug}
              isAdmin={isAdmin}
              key={child.id}
              level={level + 1}
              node={child}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WikiTree({
  activeSlug,
  isAdmin,
  onNavigate,
  tree,
}: {
  activeSlug: string;
  isAdmin: boolean;
  onNavigate?: () => void;
  tree: WikiPageTreeNode[];
}) {
  if (tree.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-5 text-sm leading-6 text-muted-foreground">
        هنوز صفحه‌ای در دانشنامه ثبت نشده است.
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      {tree.map((node) => (
        <WikiTreeBranch
          activeSlug={activeSlug}
          isAdmin={isAdmin}
          key={node.id}
          level={0}
          node={node}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

export function WikiWorkspace({
  activeSlug,
  children,
  isAdmin,
  tree,
}: WikiWorkspaceProps) {
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const drawerTrigger = drawerTriggerRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDrawerOpen(false);
      }
    };

    drawerRef.current?.focus();
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      drawerTrigger?.focus();
    };
  }, [isDrawerOpen]);

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 xl:hidden">
        <div className="grid gap-0.5">
          <h2 className="text-sm font-semibold text-slate-950">دانشنامه</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            فهرست موضوعات را باز کنید.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/wiki/transfer" aria-label="خروجی و ورود دانشنامه">
                  <ArrowLeftRight className="h-4 w-4" />
                  <span className="hidden sm:inline">انتقال</span>
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/wiki/new">صفحه جدید</Link>
              </Button>
            </>
          ) : null}
          <Button
            aria-expanded={isDrawerOpen}
            aria-label="باز کردن فهرست دانشنامه"
            onClick={() => setIsDrawerOpen(true)}
            ref={drawerTriggerRef}
            size="icon"
            type="button"
            variant="outline"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="grid gap-1">
                <h2 className="text-base font-semibold text-slate-950">
                  فهرست دانشنامه
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  ساختار موضوعات و صفحات.
                </p>
              </div>
              {isAdmin ? (
                <div className="flex items-center gap-1">
                  <Button asChild size="icon" variant="ghost">
                    <Link href="/wiki/transfer" aria-label="خروجی و ورود دانشنامه">
                      <ArrowLeftRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/wiki/new">صفحه جدید</Link>
                  </Button>
                </div>
              ) : null}
            </div>

            <WikiTree activeSlug={activeSlug} isAdmin={isAdmin} tree={tree} />
          </div>
        </aside>
        <main className="grid min-w-0 gap-6">{children}</main>
      </div>

      {isDrawerOpen ? (
        <div
          aria-labelledby="wiki-drawer-title"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/35 xl:hidden"
          dir="rtl"
          ref={drawerRef}
          role="dialog"
          tabIndex={-1}
        >
          <div className="absolute inset-y-0 right-0 w-[min(22rem,calc(100vw-1.5rem))] border-l border-slate-200 bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-950" id="wiki-drawer-title">
                  فهرست دانشنامه
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  برای جابه‌جایی بین موضوعات.
                </p>
              </div>
              <Button
                aria-label="بستن فهرست"
                onClick={() => setIsDrawerOpen(false)}
                size="icon"
                type="button"
                variant="outline"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-[calc(100vh-4rem)] overflow-y-auto p-4">
              <WikiTree
                activeSlug={activeSlug}
                isAdmin={isAdmin}
                onNavigate={() => setIsDrawerOpen(false)}
                tree={tree}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
