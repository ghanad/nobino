import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { beforeEach, test } from "node:test";

import { DocumentNodeType } from "@prisma/client";
import sharp from "sharp";

import { validateDocumentContent } from "@/lib/document-content";
import {
  DocumentImageError,
  getDocumentImageDirectory,
  MAX_DOCUMENT_IMAGE_BYTES,
  resolveDocumentImagePath,
} from "@/lib/document-image-storage";
import {
  createDocumentNode,
  deleteDocumentNode,
  DocumentServiceError,
  getDocumentTree,
  moveDocumentNode,
  renameDocumentNode,
  updateDocumentPage,
  uploadDocumentImage,
} from "@/lib/document-service";

import { adminId, db, managerId, registerBusinessRuleTestHooks, userId } from "./business-rules-helpers";

const imageDirectory = path.resolve(process.cwd(), ".test-build", "document-images");
process.env.DOCUMENT_IMAGE_DIR = imageDirectory;
registerBusinessRuleTestHooks();

beforeEach(() => {
  rmSync(imageDirectory, { force: true, recursive: true });
  mkdirSync(imageDirectory, { recursive: true });
});

async function createPage(title = "راهنمای آزمایشی", parentId: string | null = null) {
  return createDocumentNode({ adminId, parentId, title, type: DocumentNodeType.PAGE });
}

async function validPng(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 10, channels: 3, background: "#2563eb" } }).png().toBuffer();
}

function contentWithImage(imageId: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "تصویر" }] }, { type: "image", attrs: { imageId, src: `/api/document-images/${imageId}`, alt: "نمونه تصویر" } }] };
}

test("all active authenticated roles can read the document tree", async () => {
  await createPage();
  for (const actorId of [userId, managerId, adminId]) {
    const tree = await getDocumentTree(actorId);
    assert.equal(tree.length, 1);
  }
});

test("only admins can mutate documents or upload images", async () => {
  const page = await createPage();
  await assert.rejects(() => renameDocumentNode({ adminId: userId, documentId: page.id, title: "غیرمجاز" }), DocumentServiceError);
  await assert.rejects(() => renameDocumentNode({ adminId: managerId, documentId: page.id, title: "غیرمجاز" }), DocumentServiceError);
  await assert.rejects(() => uploadDocumentImage({ adminId: userId, documentId: page.id, bytes: Buffer.from("x"), mimeType: "image/png", originalFileName: "x.png" }), DocumentServiceError);
});

test("a page cannot be a parent and folders reject page content", async () => {
  const page = await createPage();
  await assert.rejects(() => createPage("فرزند نامعتبر", page.id), /صفحه نمی‌تواند والد/);
  const folder = await createDocumentNode({ adminId, parentId: null, title: "پوشه", type: DocumentNodeType.FOLDER });
  await assert.rejects(() => updateDocumentPage({ adminId, documentId: folder.id, content: { type: "doc", content: [] }, expectedUpdatedAt: folder.updatedAt }), /صفحه پیدا نشد/);
});

test("folders cannot move into themselves or descendants", async () => {
  const root = await createDocumentNode({ adminId, parentId: null, title: "ریشه", type: DocumentNodeType.FOLDER });
  const child = await createDocumentNode({ adminId, parentId: root.id, title: "زیرپوشه", type: DocumentNodeType.FOLDER });
  await assert.rejects(() => moveDocumentNode({ adminId, documentId: root.id, parentId: root.id }), /داخل خودش/);
  await assert.rejects(() => moveDocumentNode({ adminId, documentId: root.id, parentId: child.id }), /زیرپوشه/);
});

test("move, reorder, and delete keep sibling positions contiguous", async () => {
  const a = await createPage("الف");
  const b = await createPage("ب");
  const c = await createPage("پ");
  await moveDocumentNode({ adminId, documentId: c.id, parentId: null, position: 0 });
  await deleteDocumentNode({ adminId, documentId: b.id });
  const rows = await db.documentNode.findMany({ where: { parentId: null }, orderBy: { position: "asc" }, select: { id: true, position: true } });
  assert.deepEqual(rows.map((row) => row.position), [0, 1]);
  assert.deepEqual(rows.map((row) => row.id), [c.id, a.id]);
});

test("non-empty folders cannot be deleted", async () => {
  const folder = await createDocumentNode({ adminId, parentId: null, title: "پوشه", type: DocumentNodeType.FOLDER });
  await createPage("صفحه", folder.id);
  await assert.rejects(() => deleteDocumentNode({ adminId, documentId: folder.id }), /غیرخالی/);
});

test("editor JSON rejects unsupported nodes, unsafe links, and base64 images", () => {
  assert.throws(() => validateDocumentContent({ type: "doc", content: [{ type: "script" }] }));
  assert.throws(() => validateDocumentContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] }));
  assert.throws(() => validateDocumentContent({ type: "doc", content: [{ type: "image", attrs: { imageId: "x", src: "data:image/png;base64,abc", alt: "x" } }] }));
  assert.throws(() => validateDocumentContent({ type: "doc", content: [{ type: "paragraph", attrs: { dir: "sideways" } }] }), /جهت متن نامعتبر/);
});

test("editor JSON preserves RTL and LTR text direction", () => {
  const result = validateDocumentContent({
    type: "doc",
    content: [
      { type: "paragraph", attrs: { dir: "rtl" }, content: [{ type: "text", text: "متن فارسی" }] },
      { type: "heading", attrs: { level: 2, dir: "ltr" }, content: [{ type: "text", text: "English title" }] },
    ],
  });
  assert.deepEqual(result.content, {
    type: "doc",
    content: [
      { type: "paragraph", attrs: { dir: "rtl" }, content: [{ type: "text", text: "متن فارسی" }] },
      { type: "heading", attrs: { level: 2, dir: "ltr" }, content: [{ type: "text", text: "English title" }] },
    ],
  });
});

test("page updates only accept images owned by that page", async () => {
  const first = await createPage("اول");
  const second = await createPage("دوم");
  const image = await uploadDocumentImage({ adminId, documentId: second.id, bytes: await validPng(), mimeType: "image/png", originalFileName: "sample.png" });
  await assert.rejects(() => updateDocumentPage({ adminId, documentId: first.id, content: contentWithImage(image.id), expectedUpdatedAt: first.updatedAt }), /تعلق ندارد/);
});

test("concurrent page edits are detected without overwriting newer content", async () => {
  const page = await createPage();
  await updateDocumentPage({ adminId, documentId: page.id, expectedUpdatedAt: page.updatedAt, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "نسخه جدید" }] }] } });
  await assert.rejects(() => updateDocumentPage({ adminId, documentId: page.id, expectedUpdatedAt: page.updatedAt, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "نسخه قدیمی" }] }] } }), /نشست دیگری/);
  assert.equal((await db.documentNode.findUniqueOrThrow({ where: { id: page.id } })).plainText, "نسخه جدید");
});

test("image upload validates size and decoded format", async () => {
  const page = await createPage();
  await assert.rejects(() => uploadDocumentImage({ adminId, documentId: page.id, bytes: Buffer.alloc(MAX_DOCUMENT_IMAGE_BYTES + 1), mimeType: "image/png", originalFileName: "large.png" }), DocumentImageError);
  await assert.rejects(() => uploadDocumentImage({ adminId, documentId: page.id, bytes: Buffer.from("not-an-image"), mimeType: "image/png", originalFileName: "fake.png" }), DocumentImageError);
  await assert.rejects(() => uploadDocumentImage({ adminId, documentId: page.id, bytes: Buffer.from("<svg/>"), mimeType: "image/svg+xml", originalFileName: "bad.svg" }), DocumentImageError);
});

test("stored image paths cannot traverse outside the configured directory", () => {
  assert.equal(getDocumentImageDirectory(), imageDirectory);
  assert.throws(() => resolveDocumentImagePath("../secret.webp"), DocumentImageError);
  assert.throws(() => resolveDocumentImagePath("not-random.webp"), DocumentImageError);
});

test("page deletion removes image metadata and its stored file", async () => {
  const page = await createPage();
  const image = await uploadDocumentImage({ adminId, documentId: page.id, bytes: await validPng(), mimeType: "image/png", originalFileName: "photo.png" });
  const metadata = await db.documentImage.findUniqueOrThrow({ where: { id: image.id } });
  const storedPath = resolveDocumentImagePath(metadata.storedFileName);
  assert.equal(existsSync(storedPath), true);
  await deleteDocumentNode({ adminId, documentId: page.id });
  assert.equal(await db.documentImage.findUnique({ where: { id: image.id } }), null);
  assert.equal(existsSync(storedPath), false);
});
