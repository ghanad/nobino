import Link from "next/link";
import { UserRole } from "@prisma/client";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { UrlToast } from "@/components/ui/url-toast";
import { createEmptyWikiContent } from "@/lib/wiki-content";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { canManageWiki } from "@/lib/permissions";
import { getWikiPageCreateContext, getWikiTreeForUser } from "@/lib/wiki-service";
import { createWikiPageAction } from "@/app/wiki/actions";
import { WikiWorkspace } from "@/app/wiki/_components/wiki-workspace";
import { WikiEditorForm } from "@/app/wiki/_components/wiki-editor-form";
import { getWikiToast } from "@/app/wiki/wiki-toast";

type WikiNewPageProps = {
  searchParams?: Promise<{
    error?: string;
    parent?: string;
  }>;
};

export default async function WikiNewPage({ searchParams }: WikiNewPageProps) {
  const user = await requireRole([UserRole.ADMIN]);
  const params = await searchParams;
  const toast = getWikiToast(params);
  const { defaultParentId, parentOptions } = await getWikiPageCreateContext(
    user,
    params?.parent ?? null,
  );
  const tree = await getWikiTreeForUser(user);

  return (
    <AppShell user={user}>
      <WikiWorkspace activeSlug="" isAdmin={canManageWiki(user.role)} tree={tree}>
        <div className="grid gap-5" dir="rtl">
          <div className="flex items-start justify-between gap-4">
            <PageHeader
              subtitle="صفحه جدید را بسازید یا یک شاخه ریشه‌ای اضافه کنید."
              title="صفحه جدید دانشنامه"
            />
            <Button asChild variant="outline">
              <Link href="/wiki">بازگشت</Link>
            </Button>
          </div>

          {toast ? <UrlToast {...toast} /> : null}

          <WikiEditorForm
            action={createWikiPageAction}
            contentJson={createEmptyWikiContent()}
            initialIsHidden={false}
            initialParentId={defaultParentId}
            initialSlug=""
            initialTitle=""
            parentOptions={parentOptions}
            showSlugField
            submitLabel="ایجاد صفحه"
          />
        </div>
      </WikiWorkspace>
    </AppShell>
  );
}
