import type { ReactNode } from "react";

import { DocumentTree, type DocumentTreeItem } from "@/components/documents/document-tree";

export function DocumentBrowserShell({ children, items, selectedId }: { children: ReactNode; items: DocumentTreeItem[]; selectedId?: string }) {
  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-950">مستندات</h1>
        <p className="mt-1 text-sm text-slate-600">راهنماها و اطلاعات داخلی نوبینو</p>
      </div>
      <details className="mb-4 rounded-lg border bg-card p-3 lg:hidden">
        <summary className="cursor-pointer font-semibold">فهرست مستندات</summary>
        <div className="mt-3 border-t pt-3"><DocumentTree items={items} selectedId={selectedId} /></div>
      </details>
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden max-h-[calc(100vh-10rem)] overflow-y-auto rounded-lg border bg-card p-3 lg:block"><DocumentTree items={items} selectedId={selectedId} /></aside>
        <section className="min-w-0 rounded-lg border bg-card p-5 sm:p-8">{children}</section>
      </div>
    </div>
  );
}
