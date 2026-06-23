import type { JSONContent } from "@tiptap/react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentBrowserShell } from "@/components/documents/document-browser-shell";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { requireCurrentUser } from "@/lib/auth";
import { getDocumentPage, getDocumentTree } from "@/lib/document-service";
import { formatJalaliDateWithoutWeekday } from "@/lib/jalali-date";

export default async function DocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const user = await requireCurrentUser();
  const { documentId } = await params;
  const [tree, page] = await Promise.all([getDocumentTree(user.id), getDocumentPage(user.id, documentId)]);
  if (!page) notFound();
  return (
    <DocumentBrowserShell items={tree} selectedId={page.id}>
      <nav aria-label="مسیر صفحه" className="mb-4 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <Link className="hover:text-blue-700" href="/documents">مستندات</Link>
        {page.breadcrumbs.map((item) => <span key={item.id}>/ {item.title}</span>)}
      </nav>
      <article>
        <h2 className="mb-2 text-3xl font-bold text-slate-950">{page.title}</h2>
        <p className="mb-8 text-xs text-slate-500">آخرین به‌روزرسانی: {formatJalaliDateWithoutWeekday(page.updatedAt)}</p>
        <DocumentViewer content={page.content as JSONContent} />
      </article>
    </DocumentBrowserShell>
  );
}
