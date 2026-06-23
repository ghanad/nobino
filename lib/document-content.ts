import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

const MAX_CONTENT_BYTES = 500_000;
const MAX_CONTENT_DEPTH = 30;
const MAX_CONTENT_NODES = 10_000;
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "image",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
]);
const MARK_TYPES = new Set(["bold", "italic", "code", "link"]);

export class DocumentContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentContentError";
  }
}

type JsonObject = Record<string, unknown>;

export type ValidatedDocumentContent = {
  content: Prisma.InputJsonValue;
  contentBytes: number;
  contentHash: string;
  imageIds: Set<string>;
  plainText: string;
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertKeys(value: JsonObject, keys: string[], label: string): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new DocumentContentError(`${label} دارای ویژگی پشتیبانی‌نشده است.`);
  }
}

export function isSafeDocumentLink(href: string): boolean {
  const value = href.trim();
  if (!value || value.startsWith("//")) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (value.startsWith("#")) return true;

  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function normalizeMarks(value: unknown): Prisma.InputJsonValue[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new DocumentContentError("نشانه‌گذاری متن نامعتبر است.");
  }

  return value.map((mark) => {
    if (!isObject(mark) || typeof mark.type !== "string" || !MARK_TYPES.has(mark.type)) {
      throw new DocumentContentError("نشانه‌گذاری متن پشتیبانی نمی‌شود.");
    }
    assertKeys(mark, ["type", "attrs"], "نشانه‌گذاری");

    if (mark.type !== "link") {
      if (mark.attrs !== undefined) {
        throw new DocumentContentError("ویژگی نشانه‌گذاری نامعتبر است.");
      }
      return { type: mark.type };
    }

    if (!isObject(mark.attrs)) {
      throw new DocumentContentError("نشانی پیوند الزامی است.");
    }
    assertKeys(mark.attrs, ["href", "target", "rel", "class"], "پیوند");
    if (typeof mark.attrs.href !== "string" || !isSafeDocumentLink(mark.attrs.href)) {
      throw new DocumentContentError("نشانی پیوند امن نیست.");
    }

    return {
      type: "link",
      attrs: {
        href: mark.attrs.href.trim(),
        rel: "noopener noreferrer nofollow",
        target: mark.attrs.target === "_blank" ? "_blank" : null,
      },
    };
  });
}

export function validateDocumentContent(value: unknown): ValidatedDocumentContent {
  if (!isObject(value) || value.type !== "doc") {
    throw new DocumentContentError("ریشه محتوای صفحه باید سند باشد.");
  }
  let nodeCount = 0;
  const imageIds = new Set<string>();
  const textParts: string[] = [];

  function normalizeNode(node: unknown, depth: number): Prisma.InputJsonValue {
    nodeCount += 1;
    if (depth > MAX_CONTENT_DEPTH || nodeCount > MAX_CONTENT_NODES) {
      throw new DocumentContentError("ساختار محتوا بیش از حد بزرگ یا تو در تو است.");
    }
    if (!isObject(node) || typeof node.type !== "string" || !NODE_TYPES.has(node.type)) {
      throw new DocumentContentError("نوعی از محتوای ویرایشگر پشتیبانی نمی‌شود.");
    }
    assertKeys(node, ["type", "attrs", "content", "marks", "text"], "گره محتوا");

    if (node.type === "text") {
      if (typeof node.text !== "string" || node.text.length > 100_000) {
        throw new DocumentContentError("متن محتوا نامعتبر است.");
      }
      if (node.attrs !== undefined || node.content !== undefined) {
        throw new DocumentContentError("ساختار متن نامعتبر است.");
      }
      textParts.push(node.text);
      const marks = normalizeMarks(node.marks);
      return marks ? { type: "text", text: node.text, marks } : { type: "text", text: node.text };
    }

    if (node.marks !== undefined || node.text !== undefined) {
      throw new DocumentContentError("ساختار گره محتوا نامعتبر است.");
    }

    let attrs: Prisma.InputJsonValue | undefined;
    if (node.type === "heading") {
      if (!isObject(node.attrs)) throw new DocumentContentError("سطح عنوان نامعتبر است.");
      assertKeys(node.attrs, ["level"], "عنوان");
      if (![2, 3, 4].includes(Number(node.attrs.level))) {
        throw new DocumentContentError("سطح عنوان پشتیبانی نمی‌شود.");
      }
      attrs = { level: Number(node.attrs.level) };
    } else if (node.type === "orderedList") {
      if (node.attrs !== undefined) {
        if (!isObject(node.attrs)) throw new DocumentContentError("فهرست نامعتبر است.");
        assertKeys(node.attrs, ["start"], "فهرست");
        const start = Number(node.attrs.start ?? 1);
        if (!Number.isInteger(start) || start < 1 || start > 10_000) {
          throw new DocumentContentError("شماره شروع فهرست نامعتبر است.");
        }
        attrs = { start };
      }
    } else if (["codeBlock"].includes(node.type)) {
      if (node.attrs !== undefined) {
        if (!isObject(node.attrs)) throw new DocumentContentError("بلوک کد نامعتبر است.");
        assertKeys(node.attrs, ["language"], "بلوک کد");
        attrs = { language: null };
      }
    } else if (["tableCell", "tableHeader"].includes(node.type)) {
      if (node.attrs !== undefined) {
        if (!isObject(node.attrs)) throw new DocumentContentError("سلول جدول نامعتبر است.");
        assertKeys(node.attrs, ["colspan", "rowspan", "colwidth"], "سلول جدول");
        const colspan = Number(node.attrs.colspan ?? 1);
        const rowspan = Number(node.attrs.rowspan ?? 1);
        if (![colspan, rowspan].every((part) => Number.isInteger(part) && part >= 1 && part <= 50)) {
          throw new DocumentContentError("ابعاد سلول جدول نامعتبر است.");
        }
        attrs = { colspan, rowspan, colwidth: null };
      }
    } else if (node.type === "image") {
      if (!isObject(node.attrs)) throw new DocumentContentError("تصویر نامعتبر است.");
      assertKeys(node.attrs, ["imageId", "src", "alt", "title"], "تصویر");
      if (typeof node.attrs.imageId !== "string" || !node.attrs.imageId) {
        throw new DocumentContentError("شناسه تصویر نامعتبر است.");
      }
      if (typeof node.attrs.alt !== "string" || !node.attrs.alt.trim() || node.attrs.alt.length > 300) {
        throw new DocumentContentError("متن جایگزین تصویر الزامی است.");
      }
      if (typeof node.attrs.src === "string" && (node.attrs.src.startsWith("data:") || node.attrs.src.startsWith("javascript:"))) {
        throw new DocumentContentError("نشانی تصویر امن نیست.");
      }
      imageIds.add(node.attrs.imageId);
      attrs = {
        imageId: node.attrs.imageId,
        src: `/api/document-images/${encodeURIComponent(node.attrs.imageId)}`,
        alt: node.attrs.alt.trim(),
        title: typeof node.attrs.title === "string" ? node.attrs.title.slice(0, 300) : null,
      };
    } else if (node.attrs !== undefined) {
      if (!isObject(node.attrs) || Object.keys(node.attrs).length > 0) {
        throw new DocumentContentError("ویژگی گره محتوا پشتیبانی نمی‌شود.");
      }
    }

    const supportsContent = !["hardBreak", "image"].includes(node.type);
    if (!supportsContent && node.content !== undefined) {
      throw new DocumentContentError("این گره نمی‌تواند فرزند داشته باشد.");
    }
    if (supportsContent && node.content !== undefined && !Array.isArray(node.content)) {
      throw new DocumentContentError("فرزندان محتوا نامعتبر هستند.");
    }

    const normalized: Record<string, Prisma.InputJsonValue> = { type: node.type };
    if (attrs !== undefined) normalized.attrs = attrs;
    if (Array.isArray(node.content)) normalized.content = node.content.map((child) => normalizeNode(child, depth + 1));
    return normalized;
  }

  const content = normalizeNode(value, 0);
  const serialized = JSON.stringify(content);
  const contentBytes = Buffer.byteLength(serialized, "utf8");
  if (contentBytes > MAX_CONTENT_BYTES) {
    throw new DocumentContentError("حجم محتوای صفحه بیش از حد مجاز است.");
  }

  return {
    content,
    contentBytes,
    contentHash: createHash("sha256").update(serialized).digest("hex"),
    imageIds,
    plainText: textParts.join(" ").replace(/\s+/g, " ").trim().slice(0, 100_000),
  };
}

export const EMPTY_DOCUMENT_CONTENT = { type: "doc", content: [{ type: "paragraph" }] } as const;
