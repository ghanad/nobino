import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Clock3, History, Plus } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { UrlToast } from "@/components/ui/url-toast";
import { getCurrentUser } from "@/lib/auth";
import { formatJalaliDateTime } from "@/lib/jalali-date";
import { canManageWiki } from "@/lib/permissions";
import { getWikiPagePath, getWikiPageSlug } from "@/lib/wiki-route";
import { getWikiPageViewBySlug } from "@/lib/wiki-service";
import { renderWikiContentHtml } from "@/lib/wiki-render.server";
import { WikiWorkspace } from "@/app/wiki/_components/wiki-workspace";
import { getWikiToast } from "@/app/wiki/wiki-toast";

type WikiPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
    moved?: string;
    updated?: string;
  }>;
};

export default async function WikiPage({ params, searchParams }: WikiPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { slug } = await params;
  const query = await searchParams;
  const toast = getWikiToast(query);
  const page = await getWikiPageViewBySlug(getWikiPageSlug(slug), user);

  if (!page) {
    notFound();
  }

  const isAdmin = canManageWiki(user.role);
  const hasHiddenAncestor = page.ancestors.some((ancestor) => ancestor.isHidden);
  const html = renderWikiContentHtml(page.contentJson as JSONContent);

  return (
    <AppShell user={user}>
      <WikiWorkspace activeSlug={page.slug} isAdmin={isAdmin} tree={page.tree}>
        <div className="grid gap-5" dir="rtl">
          <div className="flex items-start justify-between gap-4">
            <PageHeader
              subtitle={
                page.ancestors.length > 0
                  ? page.ancestors.map((ancestor) => ancestor.title).join(" / ")
                  : "صفحه دانشنامه"
              }
              title={page.title}
            />

            <div className="flex flex-wrap justify-start gap-2">
              {isAdmin ? (
                <>
                  <Button asChild variant="outline">
                    <Link href={`${getWikiPagePath(page.slug)}/edit`}>ویرایش</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/wiki/new?parent=${encodeURIComponent(page.slug)}`}>
                      <Plus className="h-4 w-4" />
                      فرزند جدید
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`${getWikiPagePath(page.slug)}/history`}>
                      <History className="h-4 w-4" />
                      تاریخچه
                    </Link>
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {toast ? <UrlToast {...toast} /> : null}

          <div className="grid gap-5 rounded-2xl border bg-white p-5">
            {page.isHidden || hasHiddenAncestor ? (
              <div className="flex flex-wrap items-center gap-2">
                {page.isHidden ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">
                    صفحه مخفی
                  </span>
                ) : null}
                {hasHiddenAncestor ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
                    زیرشاخهٔ والد مخفی
                  </span>
                ) : null}
              </div>
            ) : null}

            {page.contentText.trim() ? (
              <article
                className="wiki-content"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-7 text-muted-foreground">
                این صفحه هنوز محتوای متنی ندارد.
              </div>
            )}

            {page.children.length > 0 ? (
              <section
                aria-label="زیرصفحه‌ها"
                className="mt-3 border-t border-slate-100 pt-3"
              >
                <ul className="grid md:grid-cols-2 md:gap-x-8">
                  {page.children.map((child) => (
                    <li className="border-b border-slate-100" key={child.id}>
                      <Link
                        className="group flex min-h-12 items-center justify-between gap-3 rounded-md py-3 text-sm font-medium text-slate-700 transition-colors hover:text-slate-950 focus-visible:outline-offset-[-2px]"
                        href={getWikiPagePath(child.slug)}
                      >
                        <span>{child.title}</span>
                        <ChevronLeft
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 group-hover:-translate-x-1 group-hover:text-primary"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <footer
              aria-label="اطلاعات تاریخچه صفحه"
              className="flex flex-col gap-1.5 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <Clock3 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span>آخرین ویرایش</span>
                <span aria-hidden="true">·</span>
                <time dateTime={page.updatedAt.toISOString()} dir="rtl">
                  {formatJalaliDateTime(page.updatedAt)}
                </time>
                <span aria-hidden="true">·</span>
                <span>توسط {page.updatedByName}</span>
              </p>
              <p>
                ایجاد: {" "}
                <time dateTime={page.createdAt.toISOString()} dir="rtl">
                  {formatJalaliDateTime(page.createdAt)}
                </time>
                {" · "}
                {page.createdByName}
              </p>
            </footer>
          </div>
        </div>
      </WikiWorkspace>
    </AppShell>
  );
}
