import Link from "next/link";
import { UserRole } from "@prisma/client";
import { notFound } from "next/navigation";
import type { JSONContent } from "@tiptap/core";
import { ArrowLeft, History, Plus } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { UrlToast } from "@/components/ui/url-toast";
import { requireRole } from "@/lib/auth";
import { formatJalaliDateTime } from "@/lib/jalali-date";
import { canManageWiki } from "@/lib/permissions";
import { getWikiPagePath, getWikiPageSlug } from "@/lib/wiki-route";
import {
  deleteWikiPageAction,
  moveWikiPageAction,
  updateWikiPageAction,
} from "@/app/wiki/actions";
import {
  getWikiPageEditorContext,
  getWikiTreeForUser,
} from "@/lib/wiki-service";
import { WikiWorkspace } from "@/app/wiki/_components/wiki-workspace";
import { WikiEditorForm } from "@/app/wiki/_components/wiki-editor-form";
import { getWikiToast } from "@/app/wiki/wiki-toast";

type WikiEditPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    error?: string;
    moved?: string;
    updated?: string;
  }>;
};

export default async function WikiEditPage({
  params,
  searchParams,
}: WikiEditPageProps) {
  const user = await requireRole([UserRole.ADMIN]);
  const { slug } = await params;
  const query = await searchParams;
  const toast = getWikiToast(query);
  const { page, parentOptions } = await getWikiPageEditorContext(getWikiPageSlug(slug), user);

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
              subtitle="محتوا، والد و وضعیت نمایش صفحه را تغییر دهید."
              title={`ویرایش: ${page.title}`}
            />

            <div className="flex flex-wrap justify-start gap-2">
              <Button asChild variant="outline">
                <Link href={getWikiPagePath(page.slug)}>
                  <ArrowLeft className="h-4 w-4" />
                  مشاهده
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`${getWikiPagePath(page.slug)}/history`}>
                  <History className="h-4 w-4" />
                  تاریخچه
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/wiki/new?parent=${encodeURIComponent(page.slug)}`}>
                  <Plus className="h-4 w-4" />
                  فرزند جدید
                </Link>
              </Button>
            </div>
          </div>

          {toast ? <UrlToast {...toast} /> : null}

          <WikiEditorForm
            action={updateWikiPageAction}
            contentJson={page.contentJson as JSONContent}
            initialIsHidden={page.isHidden}
            initialParentId={page.parentId}
            initialSlug={page.slug}
            initialTitle={page.title}
            pageId={page.id}
            parentOptions={parentOptions}
            showSlugField={false}
            submitLabel="ذخیره صفحه"
          />

          <div className="grid gap-4 rounded-2xl border bg-white p-4">
            <div className="grid gap-1">
              <h2 className="text-base font-semibold text-slate-950">
                جابه‌جایی و حذف
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                ترتیب را در میان خواهر/برادرها تغییر دهید یا صفحه را با حذف نرم از درخت خارج کنید.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <form action={moveWikiPageAction} className="grid gap-3 rounded-xl border border-slate-200 p-4">
                <input name="pageId" type="hidden" value={page.id} />
                <input name="slug" type="hidden" value={page.slug} />
                <p className="text-sm font-medium text-slate-700">جابه‌جایی ترتیب</p>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton
                    className="flex-1"
                    name="direction"
                    pendingLabel="در حال جابه‌جایی..."
                    value="up"
                    variant="outline"
                  >
                    به بالا
                  </SubmitButton>
                  <SubmitButton
                    className="flex-1"
                    name="direction"
                    pendingLabel="در حال جابه‌جایی..."
                    value="down"
                    variant="outline"
                  >
                    به پایین
                  </SubmitButton>
                </div>
              </form>

              <form
                action={deleteWikiPageAction}
                className="grid gap-3 rounded-xl border border-red-200 bg-red-50/40 p-4"
              >
                <input name="pageId" type="hidden" value={page.id} />
                <input name="slug" type="hidden" value={page.slug} />
                <p className="text-sm font-medium text-red-800">حذف نرم صفحه</p>
                <p className="text-sm leading-6 text-red-700">
                  اگر این صفحه فرزند فعال داشته باشد حذف انجام نمی‌شود.
                </p>
                <SubmitButton
                  className="w-full border-red-200 text-red-700 hover:bg-red-100 hover:text-red-800"
                  pendingLabel="در حال حذف..."
                  variant="outline"
                >
                  حذف صفحه
                </SubmitButton>
              </form>
            </div>

            <div className="grid gap-2 border-t border-slate-200 pt-4 text-sm text-muted-foreground md:grid-cols-2">
              <p>
                ایجاد شده در{" "}
                <span dir="rtl" className="font-medium text-slate-700">
                  {formatJalaliDateTime(page.createdAt)}
                </span>
              </p>
              <p>
                آخرین ویرایش در{" "}
                <span dir="rtl" className="font-medium text-slate-700">
                  {formatJalaliDateTime(page.updatedAt)}
                </span>
              </p>
            </div>
          </div>
        </div>
      </WikiWorkspace>
    </AppShell>
  );
}
