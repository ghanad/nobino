"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BookOpen, FileText, Menu, Plus, X } from "lucide-react";

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

const PERSIAN_NUMBER_FORMATTER = new Intl.NumberFormat("fa-IR");

function WikiTreeBranch({
  activeSlug,
  isAdmin,
  node,
  onNavigate,
}: {
  activeSlug: string;
  isAdmin: boolean;
  node: WikiPageTreeNode;
  onNavigate?: () => void;
}) {
  const isActive = activeSlug === node.slug;

  return (
    <div className="min-w-0 grid gap-0.5">
      <Link
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group relative flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-md border border-transparent px-2.5 text-right text-sm font-medium transition-colors before:absolute before:inset-y-2 before:right-0 before:w-px before:rounded-full before:bg-transparent before:content-[''] xl:min-h-10",
          isActive
            ? "border-slate-200 bg-slate-100 text-slate-950 before:bg-primary"
            : "text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950",
          node.isHidden && isAdmin ? "opacity-70" : "",
        )}
        href={getWikiPagePath(node.slug)}
        onClick={onNavigate}
        title={node.title}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <FileText
            aria-hidden="true"
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-slate-400 transition-colors",
              isActive && "text-primary",
            )}
          />
          <span className="min-w-0 truncate">{node.title}</span>
        </span>
        {node.isHidden && isAdmin ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
            مخفی
          </span>
        ) : null}
      </Link>

      {node.children.length > 0 ? (
        <div className="mr-[1.125rem] min-w-0 grid gap-0.5 border-r border-slate-200 pr-2.5">
          {node.children.map((child) => (
            <WikiTreeBranch
              activeSlug={activeSlug}
              isAdmin={isAdmin}
              key={child.id}
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
    <nav aria-label="فهرست صفحات دانشنامه" className="min-w-0 grid gap-0.5">
      {tree.map((node) => (
        <WikiTreeBranch
          activeSlug={activeSlug}
          isAdmin={isAdmin}
          key={node.id}
          node={node}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

function countWikiPages(nodes: WikiPageTreeNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countWikiPages(node.children), 0);
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
  const pageCount = countWikiPages(tree);
  const pageCountLabel =
    pageCount === 0
      ? "بدون صفحه"
      : `${PERSIAN_NUMBER_FORMATTER.format(pageCount)} صفحه در دسترس`;

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
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4 xl:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <BookOpen aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-950">فهرست دانشنامه</h2>
            <p className="truncate text-xs leading-5 text-muted-foreground">
              {pageCountLabel}
            </p>
          </div>
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

      <div className="grid items-start gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 pb-3.5 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <BookOpen aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-950">
                      فهرست دانشنامه
                    </h2>
                    <p className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
                      {pageCountLabel}
                    </p>
                  </div>
                </div>
                {isAdmin ? (
                  <Button asChild className="h-9 w-9 shrink-0" size="icon" variant="ghost">
                    <Link
                      href="/wiki/transfer"
                      aria-label="خروجی و ورود دانشنامه"
                      title="انتقال دانشنامه"
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
              {isAdmin ? (
                <Button asChild className="mt-3.5 w-full" size="sm">
                  <Link href="/wiki/new">
                    <Plus className="h-4 w-4" />
                    صفحه جدید
                  </Link>
                </Button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2.5">
              <WikiTree activeSlug={activeSlug} isAdmin={isAdmin} tree={tree} />
            </div>
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
          <div className="absolute inset-y-0 right-0 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col border-l border-slate-200 bg-background shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <BookOpen aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950" id="wiki-drawer-title">
                    فهرست دانشنامه
                  </p>
                  <p className="truncate text-xs leading-5 text-muted-foreground">
                    {pageCountLabel}
                  </p>
                </div>
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
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">
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
