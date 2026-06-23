import type { JSONContent } from "@tiptap/react";

import { DocumentAdminTree } from "@/components/documents/document-admin-tree";
import { DocumentEditor } from "@/components/documents/document-editor";
import { requireCurrentUser } from "@/lib/auth";
import { getDocumentPage, getDocumentTree } from "@/lib/document-service";

export default async function AdminDocumentsPage({ searchParams }: { searchParams: Promise<{ documentId?: string }> }) {
  const user = await requireCurrentUser();
  const { documentId } = await searchParams;
  const [tree, page] = await Promise.all([getDocumentTree(user.id), documentId ? getDocumentPage(user.id, documentId) : Promise.resolve(null)]);
  return (
    <div dir="rtl">
      <div className="mb-6"><h1 className="text-2xl font-bold">مدیریت مستندات</h1><p className="mt-1 text-sm text-slate-600">ساختار پوشه‌ها، ترتیب صفحات و محتوای مستندات را مدیریت کنید.</p></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
        <section className="rounded-lg border bg-slate-50 p-4"><DocumentAdminTree items={tree} selectedId={page?.id} /></section>
        <section className="min-w-0 rounded-lg border bg-card p-4 sm:p-6">
          {page ? <DocumentEditor content={page.content as JSONContent} documentId={page.id} title={page.title} updatedAt={page.updatedAt.toISOString()} /> : <div className="flex min-h-64 items-center justify-center text-center text-sm text-slate-500">برای ویرایش محتوا، یک صفحه را از درخت انتخاب کنید.</div>}
        </section>
      </div>
    </div>
  );
}
