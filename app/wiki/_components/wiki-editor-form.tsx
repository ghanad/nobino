"use client";

import { useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import {
  Bold,
  Code2,
  Heading1,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  PilcrowLeft,
  PilcrowRight,
  Quote,
  Redo2,
  Unlink,
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
  className,
  onClick,
  title,
}: {
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <Button
      className={cn(
        "h-9 px-3 text-xs text-slate-700 hover:bg-white hover:text-slate-950",
        active ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "",
        className,
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
  const [isLinkPanelOpen, setIsLinkPanelOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
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

  const editorState = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) => ({
      currentLink: activeEditor?.getAttributes("link")?.href ?? "",
      formatValue: activeEditor?.isActive("heading", { level: 1 })
        ? "heading-1"
        : activeEditor?.isActive("heading", { level: 2 })
          ? "heading-2"
          : activeEditor?.isActive("heading", { level: 3 })
            ? "heading-3"
            : "paragraph",
      isLeftToRight: Boolean(
        activeEditor?.isActive("paragraph", { dir: "ltr" }) ||
          activeEditor?.isActive("heading", { dir: "ltr" }),
      ),
    }),
  });
  const currentLink = editorState?.currentLink ?? "";
  const formatValue = editorState?.formatValue ?? "paragraph";
  const isLeftToRight = editorState?.isLeftToRight ?? false;

  function applyLink() {
    if (!editor) {
      return;
    }

    const sanitized = sanitizeLinkUrl(linkUrl);

    if (!sanitized) {
      editor.chain().focus().unsetLink().run();
      setLinkUrl("");
      setIsLinkPanelOpen(false);
      return;
    }

    editor.chain().focus().setLink({ href: sanitized }).run();
    setLinkUrl(sanitized);
    setIsLinkPanelOpen(false);
  }

  function setBlockFormat(value: string) {
    if (!editor) {
      return;
    }

    const chain = editor.chain().focus();

    if (value === "paragraph") {
      chain.setParagraph().run();
      return;
    }

    const level = Number(value.at(-1)) as 1 | 2 | 3;
    chain.setHeading({ level }).run();
  }

  function setTextDirection(direction: "ltr" | "rtl") {
    if (!editor) {
      return;
    }

    const alignment = direction === "ltr" ? "left" : "right";

    editor
      .chain()
      .focus()
      .updateAttributes("paragraph", { dir: direction, textAlign: alignment })
      .updateAttributes("heading", { dir: direction, textAlign: alignment })
      .run();
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

        <label className="inline-flex h-10 w-fit self-end items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 whitespace-nowrap">
          <input
            checked={isHidden}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            onChange={(event) => setIsHidden(event.target.checked)}
            type="checkbox"
          />
          <span className="text-sm text-slate-700">مخفی برای همه غیر از مدیر</span>
        </label>
      </div>

      <div className="-mx-4 w-[calc(100%+2rem)] overflow-visible rounded-2xl border border-slate-200 bg-white">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
          <label className="sr-only" htmlFor="wiki-block-format">
            سبک متن
          </label>
          <select
            className="h-9 min-w-32 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-primary"
            id="wiki-block-format"
            onChange={(event) => setBlockFormat(event.target.value)}
            value={formatValue}
          >
            <option value="paragraph">متن عادی</option>
            <option value="heading-1">تیتر ۱</option>
            <option value="heading-2">تیتر ۲</option>
            <option value="heading-3">تیتر ۳</option>
          </select>

          <div className="flex items-center gap-1 border-s border-slate-200 ps-3">
            <EditorToolbarButton
              active={editor?.isActive("bold")}
              className="w-9 px-0"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              title="پررنگ"
            >
              <Bold className="h-4 w-4" />
            </EditorToolbarButton>
            <EditorToolbarButton
              active={editor?.isActive("italic")}
              className="w-9 px-0"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              title="مورب"
            >
              <Italic className="h-4 w-4" />
            </EditorToolbarButton>
          </div>

          <div className="flex items-center gap-1 border-s border-slate-200 ps-3">
            <EditorToolbarButton
              active={isLeftToRight}
              className="w-9 px-0"
              onClick={() => setTextDirection("ltr")}
              title="جهت پاراگراف: چپ‌به‌راست (LTR)"
            >
              <PilcrowRight className="h-4 w-5" />
            </EditorToolbarButton>
            <EditorToolbarButton
              active={!isLeftToRight}
              className="w-9 px-0"
              onClick={() => setTextDirection("rtl")}
              title="جهت پاراگراف: راست‌به‌چپ (RTL)"
            >
              <PilcrowLeft className="h-4 w-5" />
            </EditorToolbarButton>
          </div>

          <div className="flex items-center gap-1 border-s border-slate-200 ps-3">
            <EditorToolbarButton
              active={editor?.isActive("bulletList")}
              className="w-9 px-0"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              title="فهرست گلوله‌ای"
            >
              <List className="h-4 w-4" />
            </EditorToolbarButton>
            <EditorToolbarButton
              active={editor?.isActive("orderedList")}
              className="w-9 px-0"
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              title="فهرست شماره‌دار"
            >
              <ListOrdered className="h-4 w-4" />
            </EditorToolbarButton>
          </div>

          <div className="relative flex items-center gap-1 border-s border-slate-200 ps-3">
            <EditorToolbarButton
              active={Boolean(currentLink)}
              className="w-9 px-0"
              onClick={() => {
                setLinkUrl(currentLink);
                setIsMoreMenuOpen(false);
                setIsLinkPanelOpen((isOpen) => !isOpen);
              }}
              title="افزودن یا ویرایش پیوند"
            >
              <Link2 className="h-4 w-4" />
            </EditorToolbarButton>

            {isLinkPanelOpen ? (
              <div
                aria-label="ویرایش پیوند"
                className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
                role="dialog"
              >
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  آدرس پیوند
                  <input
                    autoFocus
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder="https://example.com"
                    type="url"
                    value={linkUrl}
                  />
                </label>
                <div className="mt-3 flex items-center gap-2">
                  <Button className="h-9 px-3 text-xs" onClick={applyLink} size="sm" type="button">
                    اعمال پیوند
                  </Button>
                  <Button
                    className="h-9 px-3 text-xs"
                    onClick={() => setIsLinkPanelOpen(false)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    انصراف
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative flex items-center border-s border-slate-200 ps-3">
            <EditorToolbarButton
              active={editor?.isActive("blockquote") || editor?.isActive("codeBlock")}
              className="w-9 px-0"
              onClick={() => {
                setIsLinkPanelOpen(false);
                setIsMoreMenuOpen((isOpen) => !isOpen);
              }}
              title="ابزارهای بیشتر"
            >
              <MoreHorizontal className="h-4 w-4" />
            </EditorToolbarButton>

            {isMoreMenuOpen ? (
              <div className="absolute right-0 top-12 z-20 grid min-w-44 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <Button
                  className="justify-start"
                  onClick={() => {
                    editor?.chain().focus().toggleBlockquote().run();
                    setIsMoreMenuOpen(false);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Quote className="h-4 w-4" />
                  نقل‌قول
                </Button>
                <Button
                  className="justify-start"
                  onClick={() => {
                    editor?.chain().focus().toggleCodeBlock().run();
                    setIsMoreMenuOpen(false);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Code2 className="h-4 w-4" />
                  بلوک کد
                </Button>
                {currentLink ? (
                  <Button
                    className="justify-start text-destructive hover:text-destructive"
                    onClick={() => {
                      editor?.chain().focus().unsetLink().run();
                      setLinkUrl("");
                      setIsMoreMenuOpen(false);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Unlink className="h-4 w-4" />
                    حذف پیوند
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-1 border-s border-slate-200 ps-3">
            <EditorToolbarButton
              className="w-9 px-0"
              onClick={() => editor?.chain().focus().undo().run()}
              title="بازگردانی"
            >
              <Undo2 className="h-4 w-4" />
            </EditorToolbarButton>
            <EditorToolbarButton
              className="w-9 px-0"
              onClick={() => editor?.chain().focus().redo().run()}
              title="انجام دوباره"
            >
              <Redo2 className="h-4 w-4" />
            </EditorToolbarButton>
          </div>
        </div>

        <div className="py-4">
          <EditorContent editor={editor} />
        </div>
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
