"use client";

import { useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { WIKI_EDITOR_EXTENSIONS } from "@/lib/wiki-editor-extensions";
import type { WikiParentOption } from "@/lib/wiki-service";
import { cn } from "@/lib/utils";

type WikiEditorFormProps = {
  action: (formData: FormData) => Promise<never>;
  contentJson: JSONContent;
  initialIsHidden: boolean;
  initialParentId: string | null;
  initialSlug?: string;
  initialTitle: string;
  parentOptions: WikiParentOption[];
  showSlugField: boolean;
  submitLabel: string;
  pageId?: string;
};

function formatParentOptionLabel(option: WikiParentOption): string {
  const prefix = option.depth > 0 ? `${"— ".repeat(option.depth)}` : "";

  return `${prefix}${option.label}${option.isHidden ? " (مخفی)" : ""}`;
}

function EditorToolbarButton({
  active,
  children,
  onClick,
  title,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <Button
      className={cn(
        "h-9 px-3 text-xs",
        active ? "border-slate-300 bg-slate-100 text-slate-950" : "",
      )}
      onClick={onClick}
      size="sm"
      title={title}
      type="button"
      variant="outline"
    >
      {children}
    </Button>
  );
}

function sanitizeLinkUrl(rawValue: string): string {
  const value = rawValue.trim();

  if (!value) {
    return "";
  }

  if (value.startsWith("/") || value.startsWith("#")) {
    return value;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

export function WikiEditorForm({
  action,
  contentJson,
  initialIsHidden,
  initialParentId,
  initialSlug = "",
  initialTitle,
  pageId,
  parentOptions,
  showSlugField,
  submitLabel,
}: WikiEditorFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(initialSlug);
  const [parentId, setParentId] = useState(initialParentId ?? "");
  const [isHidden, setIsHidden] = useState(initialIsHidden);
  const [linkUrl, setLinkUrl] = useState("");
  const [contentValue, setContentValue] = useState(
    JSON.stringify(contentJson),
  );

  const editor = useEditor({
    content: contentJson,
    editorProps: {
      attributes: {
        class:
          "wiki-editor min-h-[320px] rounded-b-2xl bg-white px-4 py-4 text-right outline-none",
        dir: "rtl",
      },
    },
    extensions: WIKI_EDITOR_EXTENSIONS,
    immediatelyRender: false,
    onUpdate: ({ editor: activeEditor }) => {
      setContentValue(JSON.stringify(activeEditor.getJSON()));
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.commands.setContent(contentJson, { emitUpdate: false });
    setContentValue(JSON.stringify(contentJson));
  }, [contentJson, editor]);

  const parentChoices = useMemo(
    () =>
      parentOptions.map((option) => ({
        ...option,
        label: formatParentOptionLabel(option),
      })),
    [parentOptions],
  );

  const currentLink = editor?.getAttributes("link")?.href ?? "";

  function applyLink() {
    if (!editor) {
      return;
    }

    const sanitized = sanitizeLinkUrl(linkUrl);

    if (!sanitized) {
      editor.chain().focus().unsetLink().run();
      setLinkUrl("");
      return;
    }

    editor.chain().focus().setLink({ href: sanitized }).run();
    setLinkUrl(sanitized);
  }

  return (
    <form action={action} className="grid gap-5 rounded-2xl border bg-white p-4">
      {pageId ? <input name="pageId" type="hidden" value={pageId} /> : null}
      <input name="contentJson" type="hidden" value={contentValue} />
      <input name="parentId" type="hidden" value={parentId} />
      <input name="isHidden" type="hidden" value={isHidden ? "on" : ""} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-700">عنوان صفحه</span>
          <input
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-muted-foreground focus:border-slate-300"
            name="title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="مثلاً: قوانین استفاده از اتاق جلسه"
            required
            type="text"
            value={title}
          />
        </label>

        {showSlugField ? (
          <label className="grid gap-2">
            <span className="text-sm font-medium text-slate-700">
              slug پایدار
            </span>
            <input
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-muted-foreground focus:border-slate-300"
              name="slug"
              onChange={(event) => setSlug(event.target.value)}
              placeholder="اختیاری؛ در صورت خالی بودن از عنوان ساخته می‌شود"
              type="text"
              value={slug}
            />
          </label>
        ) : (
          <input name="slug" type="hidden" value={slug} />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-700">والد</span>
          <select
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-slate-300"
            onChange={(event) => setParentId(event.target.value)}
            value={parentId}
          >
            <option value="">صفحه ریشه</option>
            {parentChoices.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
          <input
            checked={isHidden}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            onChange={(event) => setIsHidden(event.target.checked)}
            type="checkbox"
          />
          <span className="text-sm text-slate-700">مخفی برای همه غیر از مدیر</span>
        </label>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <EditorToolbarButton
            active={editor?.isActive("paragraph")}
            onClick={() => editor?.chain().focus().setParagraph().run()}
            title="متن"
          >
            <Pilcrow className="h-4 w-4" />
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor?.isActive("heading", { level: 1 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            title="تیتر ۱"
          >
            <Heading1 className="h-4 w-4" />
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor?.isActive("heading", { level: 2 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            title="تیتر ۲"
          >
            <Heading2 className="h-4 w-4" />
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor?.isActive("heading", { level: 3 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            title="تیتر ۳"
          >
            <Heading3 className="h-4 w-4" />
          </EditorToolbarButton>
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <EditorToolbarButton
            active={editor?.isActive("bold")}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor?.isActive("italic")}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor?.isActive("bulletList")}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            title="فهرست گلوله‌ای"
          >
            <List className="h-4 w-4" />
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor?.isActive("orderedList")}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            title="فهرست شماره‌دار"
          >
            <ListOrdered className="h-4 w-4" />
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor?.isActive("blockquote")}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            title="نقل‌قول"
          >
            <Quote className="h-4 w-4" />
          </EditorToolbarButton>
          <EditorToolbarButton
            active={editor?.isActive("codeBlock")}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            title="بلوک کد"
          >
            <Code2 className="h-4 w-4" />
          </EditorToolbarButton>
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              className="h-9 min-w-44 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-slate-300"
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="آدرس پیوند"
              type="url"
              value={linkUrl}
            />
            <Button
              className="h-9 px-3 text-xs"
              onClick={applyLink}
              size="sm"
              type="button"
              variant="outline"
            >
              <Link2 className="h-4 w-4" />
              اعمال پیوند
            </Button>
            <Button
              className="h-9 px-3 text-xs"
              disabled={!currentLink}
              onClick={() => {
                editor?.chain().focus().unsetLink().run();
                setLinkUrl("");
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              حذف پیوند
            </Button>
          </div>
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <EditorToolbarButton
            onClick={() => editor?.chain().focus().undo().run()}
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </EditorToolbarButton>
          <EditorToolbarButton
            onClick={() => editor?.chain().focus().redo().run()}
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </EditorToolbarButton>
        </div>

        <EditorContent editor={editor} />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-muted-foreground">
          محتوا به‌صورت JSON ساخت‌یافته ذخیره می‌شود و نسخه‌ای تازه برای تغییرات معنادار ساخته می‌شود.
        </p>
        <SubmitButton className="min-w-28" pendingLabel="در حال ذخیره...">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
