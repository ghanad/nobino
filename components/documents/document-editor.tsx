"use client";

import { useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useRouter } from "next/navigation";

import { documentEditorExtensions } from "@/components/documents/editor-extensions";

function ToolbarButton({ active = false, children, label, onClick }: { active?: boolean; children: React.ReactNode; label: string; onClick: () => void }) {
  return <button aria-label={label} className={`rounded border px-2.5 py-1.5 text-sm ${active ? "border-blue-500 bg-blue-50 text-blue-800" : "bg-white hover:bg-slate-50"}`} onClick={onClick} type="button">{children}</button>;
}

export function DocumentEditor({ content, documentId, title, updatedAt }: { content: JSONContent; documentId: string; title: string; updatedAt: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [altText, setAltText] = useState("");
  const [linkHref, setLinkHref] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const editor = useEditor({ extensions: documentEditorExtensions, content, immediatelyRender: false, editorProps: { attributes: { class: "document-content", dir: "rtl" } } });

  function setTextDirection(dir: "rtl" | "ltr") {
    if (!editor) return;
    editor.chain().focus().updateAttributes("paragraph", { dir }).updateAttributes("heading", { dir }).run();
  }

  async function save() {
    if (!editor) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", documentId, content: editor.getJSON(), expectedUpdatedAt: updatedAt }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "ذخیره انجام نشد.");
      setMessage("صفحه ذخیره شد و اکنون برای خوانندگان قابل مشاهده است.");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ذخیره انجام نشد."); }
    finally { setSaving(false); }
  }

  async function upload(file: File) {
    if (!editor) return;
    if (!altText.trim()) { setError("پیش از انتخاب تصویر، متن جایگزین را وارد کنید."); return; }
    setError("");
    const body = new FormData(); body.set("file", file);
    const response = await fetch(`/api/documents/${documentId}/images`, { method: "POST", body });
    const result = await response.json() as { error?: string; image?: { id: string; src: string } };
    if (!response.ok || !result.image) { setError(result.error || "بارگذاری تصویر انجام نشد."); return; }
    editor.chain().focus().insertContent({ type: "image", attrs: { imageId: result.image.id, src: result.image.src, alt: altText.trim() } }).run();
    setAltText("");
    if (fileInput.current) fileInput.current.value = "";
  }

  if (!editor) return <p className="p-4 text-sm text-slate-500">در حال آماده‌سازی ویرایشگر…</p>;
  return (
    <div className="document-editor" dir="rtl">
      <div className="mb-4"><h2 className="text-xl font-bold">ویرایش «{title}»</h2><p className="mt-1 text-xs text-slate-500">محتوا فقط با دکمه ذخیره منتشر می‌شود.</p></div>
      <div className="flex flex-wrap gap-1.5 rounded-t-lg border border-slate-300 bg-slate-50 p-2" role="toolbar" aria-label="ابزارهای ویرایش">
        <ToolbarButton active={editor.isActive("bold")} label="پررنگ" onClick={() => editor.chain().focus().toggleBold().run()}>پررنگ</ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} label="مورب" onClick={() => editor.chain().focus().toggleItalic().run()}>مورب</ToolbarButton>
        <ToolbarButton active={editor.isActive("paragraph", { dir: "rtl" }) || editor.isActive("heading", { dir: "rtl" })} label="نوشتن از راست به چپ" onClick={() => setTextDirection("rtl")}>راست‌به‌چپ</ToolbarButton>
        <ToolbarButton active={editor.isActive("paragraph", { dir: "ltr" }) || editor.isActive("heading", { dir: "ltr" })} label="نوشتن از چپ به راست" onClick={() => setTextDirection("ltr")}>چپ‌به‌راست</ToolbarButton>
        <ToolbarButton label="عنوان سطح دو" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>عنوان ۲</ToolbarButton>
        <ToolbarButton label="عنوان سطح سه" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>عنوان ۳</ToolbarButton>
        <ToolbarButton label="فهرست نشانه‌دار" onClick={() => editor.chain().focus().toggleBulletList().run()}>فهرست •</ToolbarButton>
        <ToolbarButton label="فهرست شماره‌دار" onClick={() => editor.chain().focus().toggleOrderedList().run()}>فهرست ۱.</ToolbarButton>
        <ToolbarButton label="نقل قول" onClick={() => editor.chain().focus().toggleBlockquote().run()}>نقل قول</ToolbarButton>
        <ToolbarButton label="کد درون‌خطی" onClick={() => editor.chain().focus().toggleCode().run()}>کد</ToolbarButton>
        <ToolbarButton label="بلوک کد" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>بلوک کد</ToolbarButton>
        <ToolbarButton label="افزودن جدول" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>جدول</ToolbarButton>
      </div>
      <div className="flex gap-2 border-x border-slate-300 bg-slate-50 px-2 pb-2">
        <input aria-label="نشانی پیوند" className="min-w-0 flex-1 rounded border bg-white px-2 py-1 text-left text-xs" dir="ltr" onChange={(event) => setLinkHref(event.target.value)} placeholder="https://example.com یا /documents/..." value={linkHref} />
        <button className="rounded border bg-white px-3 py-1 text-xs hover:bg-slate-50" onClick={() => { if (linkHref.trim()) { editor.chain().focus().extendMarkRange("link").setLink({ href: linkHref.trim() }).run(); setLinkHref(""); } }} type="button">افزودن پیوند</button>
      </div>
      <EditorContent editor={editor} />
      <div className="mt-4 rounded-lg border bg-slate-50 p-3">
        <label className="mb-1 block text-sm font-medium" htmlFor="document-image-alt">متن جایگزین تصویر</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm" id="document-image-alt" maxLength={300} onChange={(event) => setAltText(event.target.value)} placeholder="توضیح کوتاه و معنادار تصویر" value={altText} />
          <input accept="image/jpeg,image/png,image/webp" aria-label="انتخاب تصویر" className="rounded-md border bg-white px-3 py-2 text-sm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} ref={fileInput} type="file" />
        </div>
        <p className="mt-1 text-xs text-slate-500">JPEG، PNG یا WebP؛ حداکثر ۵ مگابایت</p>
      </div>
      {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">{message}</p> : null}
      <div className="mt-4 flex gap-2">
        <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={saving} onClick={() => void save()} type="button">{saving ? "در حال ذخیره…" : "ذخیره"}</button>
        <button className="rounded-md border px-4 py-2 text-sm hover:bg-slate-50" onClick={() => editor.commands.setContent(content)} type="button">انصراف از تغییرات</button>
      </div>
    </div>
  );
}
