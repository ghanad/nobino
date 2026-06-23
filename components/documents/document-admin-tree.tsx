"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, FilePlus2, FileText, Folder, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import type { DocumentTreeItem } from "@/components/documents/document-tree";

function flattenFolders(items: DocumentTreeItem[]): DocumentTreeItem[] {
  return items.flatMap((item) => item.type === "FOLDER" ? [item, ...flattenFolders(item.children)] : []);
}

export function DocumentAdminTree({ items, selectedId }: { items: DocumentTreeItem[]; selectedId?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: "create"; parentId: string | null; type: "FOLDER" | "PAGE"; value: string }
    | { kind: "rename"; documentId: string; value: string }
    | { kind: "delete"; documentId: string; title: string }
    | null
  >(null);
  const folders = flattenFolders(items);

  async function mutate(payload: Record<string, unknown>) {
    setError("");
    setPendingId(String(payload.documentId ?? "root"));
    try {
      const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; node?: { id: string; type: string } };
      if (!response.ok) throw new Error(result.error || "عملیات انجام نشد.");
      router.refresh();
      if (result.node?.type === "PAGE" && payload.action === "create") router.push(`/admin/documents?documentId=${result.node.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "عملیات انجام نشد.");
    } finally {
      setPendingId(null);
    }
  }

  function create(type: "FOLDER" | "PAGE", parentId: string | null) {
    setDialog({ kind: "create", type, parentId, value: "" });
  }

  function submitDialog() {
    if (!dialog) return;
    if (dialog.kind === "delete") void mutate({ action: "delete", documentId: dialog.documentId });
    else if (dialog.kind === "rename") void mutate({ action: "rename", documentId: dialog.documentId, title: dialog.value });
    else void mutate({ action: "create", type: dialog.type, parentId: dialog.parentId, title: dialog.value });
    setDialog(null);
  }

  function Node({ item }: { item: DocumentTreeItem }) {
    const disabled = pendingId === item.id;
    return (
      <li className="rounded-md border bg-white p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.type === "FOLDER" ? <Folder className="h-4 w-4 text-amber-600" /> : <FileText className="h-4 w-4 text-blue-600" />}
          {item.type === "PAGE" ? <Link className={`ml-auto min-w-24 flex-1 rounded px-1 py-1 text-sm font-medium hover:text-blue-700 ${selectedId === item.id ? "text-blue-700 underline" : ""}`} href={`/admin/documents?documentId=${item.id}`}>{item.title}</Link> : <span className="ml-auto min-w-24 flex-1 px-1 text-sm font-medium">{item.title}</span>}
          <button aria-label={`تغییر نام ${item.title}`} className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-50" disabled={disabled} onClick={() => setDialog({ kind: "rename", documentId: item.id, value: item.title })} type="button"><Pencil className="h-4 w-4" /></button>
          <button aria-label={`انتقال ${item.title} به بالا`} className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-50" disabled={disabled || item.position === 0} onClick={() => void mutate({ action: "move", documentId: item.id, parentId: item.parentId, position: item.position - 1 })} type="button"><ChevronUp className="h-4 w-4" /></button>
          <button aria-label={`انتقال ${item.title} به پایین`} className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-50" disabled={disabled} onClick={() => void mutate({ action: "move", documentId: item.id, parentId: item.parentId, position: item.position + 1 })} type="button"><ChevronDown className="h-4 w-4" /></button>
          <select aria-label={`پوشه مقصد ${item.title}`} className="max-w-36 rounded border px-2 py-1 text-xs" disabled={disabled} onChange={(event) => void mutate({ action: "move", documentId: item.id, parentId: event.target.value || null })} value={item.parentId ?? ""}>
            <option value="">ریشه</option>
            {folders.filter((folder) => folder.id !== item.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}
          </select>
          {item.type === "FOLDER" ? <><button aria-label={`افزودن پوشه داخل ${item.title}`} className="rounded p-1.5 hover:bg-slate-100" onClick={() => create("FOLDER", item.id)} type="button"><FolderPlus className="h-4 w-4" /></button><button aria-label={`افزودن صفحه داخل ${item.title}`} className="rounded p-1.5 hover:bg-slate-100" onClick={() => create("PAGE", item.id)} type="button"><FilePlus2 className="h-4 w-4" /></button></> : null}
          <button aria-label={`حذف ${item.title}`} className="rounded p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={disabled} onClick={() => setDialog({ kind: "delete", documentId: item.id, title: item.title })} type="button"><Trash2 className="h-4 w-4" /></button>
        </div>
        {item.children.length ? <ul className="mr-5 mt-2 space-y-2 border-r pr-3">{item.children.map((child) => <Node item={child} key={child.id} />)}</ul> : null}
      </li>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-50" onClick={() => create("FOLDER", null)} type="button"><FolderPlus className="h-4 w-4" /> پوشه ریشه</button>
        <button className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-50" onClick={() => create("PAGE", null)} type="button"><FilePlus2 className="h-4 w-4" /> صفحه ریشه</button>
      </div>
      {error ? <p className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      {items.length ? <ul className="space-y-2">{items.map((item) => <Node item={item} key={item.id} />)}</ul> : <p className="rounded-md border border-dashed p-6 text-center text-sm text-slate-500">هنوز پوشه یا صفحه‌ای ایجاد نشده است.</p>}
      {dialog ? (
        <div aria-labelledby="document-dialog-title" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog">
          <form className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onSubmit={(event) => { event.preventDefault(); submitDialog(); }}>
            <h2 className="text-lg font-bold" id="document-dialog-title">
              {dialog.kind === "delete" ? "تأیید حذف" : dialog.kind === "rename" ? "تغییر نام" : dialog.type === "FOLDER" ? "پوشه جدید" : "صفحه جدید"}
            </h2>
            {dialog.kind === "delete" ? <p className="mt-3 text-sm text-slate-700">آیا از حذف «{dialog.title}» مطمئن هستید؟ این عملیات قابل بازگشت نیست.</p> : (
              <label className="mt-4 block text-sm font-medium">عنوان
                <input autoFocus className="mt-1 w-full rounded-md border px-3 py-2" maxLength={160} onChange={(event) => setDialog({ ...dialog, value: event.target.value })} required value={dialog.value} />
              </label>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setDialog(null)} type="button">انصراف</button>
              <button className={`rounded-md px-3 py-2 text-sm text-white ${dialog.kind === "delete" ? "bg-red-700" : "bg-primary"}`} type="submit">{dialog.kind === "delete" ? "حذف" : "تأیید"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
