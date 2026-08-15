import type { JSONContent } from "@tiptap/core";

export type WikiContentTextNode = {
  content?: WikiContentTextNode[];
  marks?: Array<Record<string, unknown>>;
  text?: string;
  type: string;
};

const ALLOWED_NODE_TYPES = new Set([
  "blockquote",
  "bulletList",
  "codeBlock",
  "doc",
  "hardBreak",
  "heading",
  "horizontalRule",
  "listItem",
  "orderedList",
  "paragraph",
  "text",
]);

const ALLOWED_MARK_TYPES = new Set(["bold", "code", "italic", "link", "strike"]);
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const PERSIAN_CHAR_NORMALIZATIONS: Array<[RegExp, string]> = [
  [/\u064A/g, "ی"],
  [/\u0643/g, "ک"],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWikiText(value: string): string {
  return PERSIAN_CHAR_NORMALIZATIONS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value.normalize("NFKC"),
  );
}

export function slugifyWikiTitle(value: string): string {
  const slug = normalizeWikiText(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "page";
}

export function createEmptyWikiContent(): JSONContent {
  return {
    content: [{ type: "paragraph" }],
    type: "doc",
  };
}

function validateSafeLinkHref(href: string): void {
  if (href.startsWith("/") || href.startsWith("#")) {
    return;
  }

  try {
    const url = new URL(href);

    if (!SAFE_LINK_PROTOCOLS.has(url.protocol)) {
      throw new Error("Unsupported protocol.");
    }
  } catch {
    throw new Error("Invalid link URL.");
  }
}

function validateMarks(marks: unknown, path: string): void {
  if (marks === undefined) {
    return;
  }

  if (!Array.isArray(marks)) {
    throw new Error(`Wiki content mark is invalid at ${path}.`);
  }

  for (const [index, mark] of marks.entries()) {
    if (!isRecord(mark) || typeof mark.type !== "string") {
      throw new Error(`Wiki content mark is invalid at ${path}.marks[${index}].`);
    }

    if (!ALLOWED_MARK_TYPES.has(mark.type)) {
      throw new Error(`Wiki content mark type is not supported at ${path}.marks[${index}].`);
    }

    if (mark.type === "link") {
      if (!isRecord(mark.attrs) || typeof mark.attrs.href !== "string") {
        throw new Error(`Wiki content link is missing a valid href at ${path}.marks[${index}].`);
      }

      validateSafeLinkHref(mark.attrs.href);
    }
  }
}

function normalizeMarks(
  marks: unknown,
  path: string,
): JSONContent["marks"] | undefined {
  validateMarks(marks, path);

  if (marks === undefined) {
    return undefined;
  }

  const typedMarks = marks as Array<Record<string, unknown>>;

  return typedMarks.map((mark) => {
    const typedMark = mark as Record<string, unknown>;
    const markType = typedMark.type as string;

    if (markType !== "link") {
      return { type: markType };
    }

    const attrs = typedMark.attrs as Record<string, unknown>;

    return {
      attrs: { href: attrs.href as string },
      type: "link",
    };
  });
}

function validateHeadingAttrs(attrs: unknown, path: string): void {
  if (attrs === undefined) {
    return;
  }

  if (!isRecord(attrs)) {
    throw new Error(`Wiki heading attrs are invalid at ${path}.`);
  }

  if (attrs.level !== undefined) {
    if (
      typeof attrs.level !== "number" ||
      !Number.isInteger(attrs.level) ||
      attrs.level < 1 ||
      attrs.level > 6
    ) {
      throw new Error(`Wiki heading level is invalid at ${path}.`);
    }
  }
}

function validateNode(node: unknown, path: string): JSONContent {
  if (!isRecord(node) || typeof node.type !== "string") {
    throw new Error(`Wiki content node is invalid at ${path}.`);
  }

  if (!ALLOWED_NODE_TYPES.has(node.type)) {
    throw new Error(`Wiki content node type is not supported at ${path}.`);
  }

  const marks = normalizeMarks(node.marks, path);

  if (node.type === "text") {
    if (typeof node.text !== "string") {
      throw new Error(`Wiki text node is missing text at ${path}.`);
    }

    return {
      ...(marks ? { marks } : {}),
      text: node.text,
      type: "text",
    } as JSONContent;
  }

  if (node.text !== undefined) {
    throw new Error(`Wiki content node unexpectedly contains text at ${path}.`);
  }

  if (node.type === "heading") {
    validateHeadingAttrs(node.attrs, path);
  } else if (node.attrs !== undefined && !isRecord(node.attrs)) {
    throw new Error(`Wiki content attrs are invalid at ${path}.`);
  }

  const sourceAttrs = isRecord(node.attrs) ? node.attrs : undefined;
  const direction = sourceAttrs?.dir;
  const textAlign = sourceAttrs?.textAlign;

  if (
    direction !== undefined &&
    direction !== null &&
    direction !== "ltr" &&
    direction !== "rtl"
  ) {
    throw new Error(`Wiki content direction is invalid at ${path}.`);
  }

  if (
    textAlign !== undefined &&
    textAlign !== null &&
    !["left", "right", "center", "justify"].includes(String(textAlign))
  ) {
    throw new Error(`Wiki content text alignment is invalid at ${path}.`);
  }

  const attrs =
    node.type === "heading"
      ? {
          ...(typeof sourceAttrs?.level === "number"
            ? { level: sourceAttrs.level }
            : {}),
          ...(typeof direction === "string" ? { dir: direction } : {}),
          ...(typeof textAlign === "string" ? { textAlign } : {}),
        }
      : node.type === "paragraph"
        ? {
            ...(typeof direction === "string" ? { dir: direction } : {}),
            ...(typeof textAlign === "string" ? { textAlign } : {}),
          }
        : undefined;

  const normalizedNode = {
    ...(attrs && Object.keys(attrs).length > 0 ? { attrs } : {}),
    type: node.type,
  } as JSONContent;

  if (node.content === undefined) {
    return normalizedNode;
  }

  if (!Array.isArray(node.content)) {
    throw new Error(`Wiki content children are invalid at ${path}.`);
  }

  return {
    ...normalizedNode,
    content: node.content.map((child, index) =>
      validateNode(child, `${path}.content[${index}]`),
    ),
  };
}

export function validateWikiContentJson(value: unknown): JSONContent {
  if (!isRecord(value) || value.type !== "doc") {
    throw new Error("Wiki content must be a Tiptap document.");
  }

  if (value.content !== undefined && !Array.isArray(value.content)) {
    throw new Error("Wiki content document is invalid.");
  }

  const normalized = validateNode(value, "content");

  return normalized;
}

function extractInlineText(node: WikiContentTextNode): string {
  if (node.type === "text") {
    return normalizeWikiText(node.text ?? "");
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  const children = node.content ?? [];

  return children.map(extractInlineText).join("");
}

function extractBlockText(node: WikiContentTextNode): string {
  switch (node.type) {
    case "text":
      return normalizeWikiText(node.text ?? "");
    case "hardBreak":
      return "\n";
    case "bulletList":
      return (node.content ?? [])
        .map((item) => `- ${extractBlockText(item).trim()}`)
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((item, index) => `${index + 1}. ${extractBlockText(item).trim()}`)
        .join("\n");
    case "blockquote":
      return (node.content ?? [])
        .map((child) => extractBlockText(child).trim())
        .filter(Boolean)
        .map((line) => `> ${line}`)
        .join("\n");
    case "paragraph":
    case "heading":
    case "codeBlock":
      return extractInlineText(node);
    case "listItem":
    case "doc":
      return (node.content ?? [])
        .map((child) => extractBlockText(child))
        .join("\n\n");
    case "horizontalRule":
      return "";
    default:
      return (node.content ?? [])
        .map((child) => extractBlockText(child))
        .join("\n\n");
  }
}

export function extractWikiPlainText(content: JSONContent): string {
  const value = extractBlockText(content as WikiContentTextNode)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return value;
}
