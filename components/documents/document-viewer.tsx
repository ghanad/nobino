"use client";

import type { JSONContent } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";

import { documentEditorExtensions } from "@/components/documents/editor-extensions";

export function DocumentViewer({ content }: { content: JSONContent }) {
  const editor = useEditor({
    extensions: documentEditorExtensions,
    content,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "document-content", dir: "rtl" } },
  });
  return <EditorContent editor={editor} />;
}
