import Link from "next/link";
import { UserRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { PencilLine } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatJalaliDateTime } from "@/lib/jalali-date";
import { canManageWiki } from "@/lib/permissions";
import { getWikiPagePath, getWikiPageSlug } from "@/lib/wiki-route";
import { getWikiPageHistory, getWikiTreeForUser } from "@/lib/wiki-service";
import { WikiWorkspace } from "@/app/wiki/_components/wiki-workspace";

type WikiHistoryPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function WikiHistoryPage({ params }: WikiHistoryPageProps) {
  const user = await requireRole([UserRole.ADMIN]);
  const { slug } = await params;
  const { page, revisions } = await getWikiPageHistory(getWikiPageSlug(slug), user);

  if (!page) {
    notFound();
  }

  const tree = await getWikiTreeForUser(user);

  return (
    <AppShell user={user}>
      <WikiWorkspace activeSlug={page.slug} isAdmin={canManageWiki(user.role)} tree={tree}>
        <div className="grid gap-5" dir="rtl">
          <div className="flex items-start justify-between gap-4">
            <PageHeader
              subtitle="نسخه‌های ثبت‌شده‌ی این صفحه و ویرایشگران آن را ببینید."
              title={`تاریخچه: ${page.title}`}
            />

            <Button asChild variant="outline">
              <Link href={`${getWikiPagePath(page.slug)}/edit`}>
                <PencilLine className="h-4 w-4" />
                بازگشت به ویرایش
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 rounded-2xl border bg-white p-4">
            {revisions.length > 0 ? (
              revisions.map((revision) => (
                <article
                  className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                  key={revision.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="grid gap-1">
                      <h2 className="text-sm font-semibold text-slate-950">
                        {revision.title}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {revision.editorName}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatJalaliDateTime(revision.createdAt)}
                    </p>
                  </div>
                  {revision.contentText ? (
                    <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-7 text-slate-700">
                      {revision.contentText}
                    </p>
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-sm leading-7 text-muted-foreground">
                      این نسخه محتوای متنی نداشته است.
                    </p>
                  )}
                </article>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm leading-7 text-muted-foreground">
                هنوز نسخه‌ای برای این صفحه ثبت نشده است.
              </div>
            )}
          </div>
        </div>
      </WikiWorkspace>
    </AppShell>
  );
}
