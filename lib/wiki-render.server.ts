import "server-only";

import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";

import { WIKI_CONTENT_EXTENSIONS } from "@/lib/wiki-editor-extensions";

export function renderWikiContentHtml(content: JSONContent): string {
  return generateHTML(content, WIKI_CONTENT_EXTENSIONS);
}

