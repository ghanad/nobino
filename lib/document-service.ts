import "server-only";

import { createHash } from "node:crypto";

import { DocumentNodeType, UserRole, type Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  EMPTY_DOCUMENT_CONTENT,
  validateDocumentContent,
  type ValidatedDocumentContent,
} from "@/lib/document-content";
import {
  deleteStoredDocumentImage,
  processAndStoreDocumentImage,
} from "@/lib/document-image-storage";

type DbClient = typeof db | Prisma.TransactionClient;

const MAX_TITLE_LENGTH = 160;

const documentNodeSelect = {
  id: true,
  type: true,
  title: true,
  parentId: true,
  position: true,
  content: true,
  plainText: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.DocumentNodeSelect;

export type DocumentNodeRow = Prisma.DocumentNodeGetPayload<{ select: typeof documentNodeSelect }>;
export type DocumentTreeRow = Pick<DocumentNodeRow, "id" | "type" | "title" | "parentId" | "position">;
export type DocumentTreeNode = DocumentTreeRow & { children: DocumentTreeNode[] };

export class DocumentServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentServiceError";
  }
}

async function assertActiveUser(userId: string, client: DbClient = db) {
  const user = await client.user.findUnique({ where: { id: userId }, select: { active: true, role: true } });
  if (!user?.active) throw new DocumentServiceError("برای مشاهده مستندات باید وارد حساب فعال شوید.");
  return user;
}

async function assertAdmin(userId: string, client: DbClient = db) {
  const user = await assertActiveUser(userId, client);
  if (user.role !== UserRole.ADMIN) throw new DocumentServiceError("فقط مدیر سامانه می‌تواند مستندات را تغییر دهد.");
}

function normalizeTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (!normalized) throw new DocumentServiceError("عنوان سند الزامی است.");
  if (normalized.length > MAX_TITLE_LENGTH) throw new DocumentServiceError("عنوان سند بیش از حد طولانی است.");
  return normalized;
}

function parentFilter(parentId: string | null): Prisma.DocumentNodeWhereInput {
  return { parentId };
}

async function assertFolderParent(parentId: string | null, client: DbClient): Promise<void> {
  if (!parentId) return;
  const parent = await client.documentNode.findUnique({ where: { id: parentId }, select: { type: true } });
  if (!parent) throw new DocumentServiceError("پوشه مقصد پیدا نشد.");
  if (parent.type !== DocumentNodeType.FOLDER) throw new DocumentServiceError("صفحه نمی‌تواند والد سند دیگری باشد.");
}

async function normalizeSiblingPositions(parentId: string | null, client: DbClient): Promise<void> {
  const siblings = await client.documentNode.findMany({
    where: parentFilter(parentId),
    orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, position: true },
  });
  for (const [position, sibling] of siblings.entries()) {
    if (sibling.position !== position) {
      await client.documentNode.update({ where: { id: sibling.id }, data: { position } });
    }
  }
}

function contentAuditMetadata(content: unknown) {
  const serialized = JSON.stringify(content ?? null);
  return {
    contentBytes: Buffer.byteLength(serialized, "utf8"),
    contentHash: createHash("sha256").update(serialized).digest("hex"),
  };
}

export function buildDocumentTree(rows: DocumentTreeRow[]): DocumentTreeNode[] {
  const nodes = new Map<string, DocumentTreeNode>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [] });
  const roots: DocumentTreeNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: DocumentTreeNode[]) => {
    items.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

export async function getDocumentTree(userId: string): Promise<DocumentTreeNode[]> {
  await assertActiveUser(userId);
  const rows = await db.documentNode.findMany({
    orderBy: [{ parentId: "asc" }, { position: "asc" }, { id: "asc" }],
    select: { id: true, type: true, title: true, parentId: true, position: true },
  });
  return buildDocumentTree(rows);
}

export async function getDocumentPage(userId: string, documentId: string) {
  await assertActiveUser(userId);
  const page = await db.documentNode.findUnique({ where: { id: documentId }, select: documentNodeSelect });
  if (!page || page.type !== DocumentNodeType.PAGE) return null;

  const breadcrumbs: Array<{ id: string; title: string }> = [];
  let parentId = page.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = await db.documentNode.findUnique({ where: { id: parentId }, select: { id: true, title: true, parentId: true } });
    if (!parent) break;
    breadcrumbs.unshift({ id: parent.id, title: parent.title });
    parentId = parent.parentId;
  }
  return { ...page, breadcrumbs };
}

export async function createDocumentNode(input: {
  adminId: string;
  parentId: string | null;
  title: string;
  type: DocumentNodeType;
}) {
  const title = normalizeTitle(input.title);
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    await assertFolderParent(input.parentId, tx);
    const position = await tx.documentNode.count({ where: parentFilter(input.parentId) });
    const content = input.type === DocumentNodeType.PAGE ? EMPTY_DOCUMENT_CONTENT : undefined;
    const node = await tx.documentNode.create({
      data: {
        type: input.type,
        title,
        parentId: input.parentId,
        position,
        content,
        plainText: "",
        createdById: input.adminId,
        updatedById: input.adminId,
      },
      select: documentNodeSelect,
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "DocumentNode",
        entityId: node.id,
        action: "DOCUMENT_CREATED",
        newValue: { title, type: input.type, parentId: input.parentId, position },
      },
    });
    return node;
  });
}

export async function renameDocumentNode(input: { adminId: string; documentId: string; title: string }) {
  const title = normalizeTitle(input.title);
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const current = await tx.documentNode.findUnique({ where: { id: input.documentId }, select: { id: true, title: true } });
    if (!current) throw new DocumentServiceError("سند پیدا نشد.");
    const updated = await tx.documentNode.update({ where: { id: current.id }, data: { title, updatedById: input.adminId }, select: documentNodeSelect });
    await tx.auditLog.create({ data: { actorUserId: input.adminId, entityType: "DocumentNode", entityId: current.id, action: "DOCUMENT_RENAMED", oldValue: { title: current.title }, newValue: { title } } });
    return updated;
  });
}

async function assertMoveDoesNotCreateCycle(documentId: string, parentId: string | null, client: DbClient): Promise<void> {
  if (!parentId) return;
  if (documentId === parentId) throw new DocumentServiceError("پوشه را نمی‌توان داخل خودش منتقل کرد.");
  const visited = new Set<string>();
  let cursor: string | null = parentId;
  while (cursor) {
    if (cursor === documentId) throw new DocumentServiceError("پوشه را نمی‌توان داخل یکی از زیرپوشه‌های خودش منتقل کرد.");
    if (visited.has(cursor)) throw new DocumentServiceError("ساختار پوشه‌ها دارای چرخه است.");
    visited.add(cursor);
    const node: { parentId: string | null } | null = await client.documentNode.findUnique({ where: { id: cursor }, select: { parentId: true } });
    cursor = node?.parentId ?? null;
  }
}

export async function moveDocumentNode(input: {
  adminId: string;
  documentId: string;
  parentId: string | null;
  position?: number;
}) {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const current = await tx.documentNode.findUnique({ where: { id: input.documentId }, select: { id: true, parentId: true, position: true, type: true, title: true } });
    if (!current) throw new DocumentServiceError("سند پیدا نشد.");
    await assertFolderParent(input.parentId, tx);
    if (current.type === DocumentNodeType.FOLDER) await assertMoveDoesNotCreateCycle(current.id, input.parentId, tx);

    const targetCount = await tx.documentNode.count({ where: { ...parentFilter(input.parentId), id: { not: current.id } } });
    const requested = input.position ?? targetCount;
    const position = Math.max(0, Math.min(Number.isInteger(requested) ? requested : targetCount, targetCount));
    await tx.documentNode.update({ where: { id: current.id }, data: { parentId: input.parentId, position: -1, updatedById: input.adminId } });
    await normalizeSiblingPositions(current.parentId, tx);
    const targetSiblings = await tx.documentNode.findMany({ where: { ...parentFilter(input.parentId), id: { not: current.id } }, orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true } });
    targetSiblings.splice(position, 0, { id: current.id });
    for (const [nextPosition, sibling] of targetSiblings.entries()) {
      await tx.documentNode.update({ where: { id: sibling.id }, data: { position: nextPosition } });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "DocumentNode",
        entityId: current.id,
        action: current.parentId === input.parentId ? "DOCUMENT_REORDERED" : "DOCUMENT_MOVED",
        oldValue: { parentId: current.parentId, position: current.position, title: current.title },
        newValue: { parentId: input.parentId, position, title: current.title },
      },
    });
    return tx.documentNode.findUniqueOrThrow({ where: { id: current.id }, select: documentNodeSelect });
  });
}

export async function updateDocumentPage(input: {
  adminId: string;
  content: unknown;
  documentId: string;
  expectedUpdatedAt: Date;
}) {
  const validated = validateDocumentContent(input.content);
  const filesToDelete: string[] = [];
  const updated = await db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const current = await tx.documentNode.findUnique({ where: { id: input.documentId }, select: { id: true, type: true, title: true, content: true, updatedAt: true } });
    if (!current || current.type !== DocumentNodeType.PAGE) throw new DocumentServiceError("صفحه پیدا نشد.");
    if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      throw new DocumentServiceError("این صفحه در نشست دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.");
    }

    const images = await tx.documentImage.findMany({ where: { documentId: current.id }, select: { id: true, storedFileName: true } });
    const ownedImageIds = new Set(images.map((image) => image.id));
    if ([...validated.imageIds].some((imageId) => !ownedImageIds.has(imageId))) {
      throw new DocumentServiceError("یکی از تصاویر به این صفحه تعلق ندارد.");
    }
    const removedImages = images.filter((image) => !validated.imageIds.has(image.id));
    const now = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    const result = await tx.documentNode.updateMany({
      where: { id: current.id, updatedAt: input.expectedUpdatedAt },
      data: { content: validated.content, plainText: validated.plainText, updatedById: input.adminId, updatedAt: now },
    });
    if (result.count !== 1) throw new DocumentServiceError("این صفحه در نشست دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.");
    if (removedImages.length) await tx.documentImage.deleteMany({ where: { id: { in: removedImages.map((image) => image.id) } } });
    filesToDelete.push(...removedImages.map((image) => image.storedFileName));
    await tx.auditLog.create({
      data: {
        actorUserId: input.adminId,
        entityType: "DocumentNode",
        entityId: current.id,
        action: "DOCUMENT_UPDATED",
        oldValue: { title: current.title, ...contentAuditMetadata(current.content) },
        newValue: { title: current.title, contentBytes: validated.contentBytes, contentHash: validated.contentHash },
      },
    });
    return tx.documentNode.findUniqueOrThrow({ where: { id: current.id }, select: documentNodeSelect });
  });
  await Promise.all(filesToDelete.map((fileName) => deleteStoredDocumentImage(fileName).catch(() => undefined)));
  return updated;
}

export async function deleteDocumentNode(input: { adminId: string; documentId: string }) {
  const filesToDelete: string[] = [];
  await db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const current = await tx.documentNode.findUnique({
      where: { id: input.documentId },
      select: { id: true, type: true, title: true, parentId: true, position: true, _count: { select: { children: true } }, images: { select: { storedFileName: true } } },
    });
    if (!current) throw new DocumentServiceError("سند پیدا نشد.");
    if (current.type === DocumentNodeType.FOLDER && current._count.children > 0) throw new DocumentServiceError("پوشه غیرخالی را نمی‌توان حذف کرد.");
    filesToDelete.push(...current.images.map((image) => image.storedFileName));
    await tx.documentImage.deleteMany({ where: { documentId: current.id } });
    await tx.documentNode.delete({ where: { id: current.id } });
    await normalizeSiblingPositions(current.parentId, tx);
    await tx.auditLog.create({ data: { actorUserId: input.adminId, entityType: "DocumentNode", entityId: current.id, action: "DOCUMENT_DELETED", oldValue: { title: current.title, type: current.type, parentId: current.parentId, position: current.position } } });
  });
  await Promise.all(filesToDelete.map((fileName) => deleteStoredDocumentImage(fileName).catch(() => undefined)));
}

export async function uploadDocumentImage(input: {
  adminId: string;
  bytes: Buffer;
  documentId: string;
  mimeType: string;
  originalFileName: string;
}) {
  await assertAdmin(input.adminId);
  const page = await db.documentNode.findUnique({ where: { id: input.documentId }, select: { type: true } });
  if (!page || page.type !== DocumentNodeType.PAGE) throw new DocumentServiceError("تصویر فقط به یک صفحه موجود افزوده می‌شود.");
  const stored = await processAndStoreDocumentImage({ bytes: input.bytes, declaredMimeType: input.mimeType });
  try {
    return await db.$transaction(async (tx) => {
      await assertAdmin(input.adminId, tx);
      const currentPage = await tx.documentNode.findUnique({ where: { id: input.documentId }, select: { type: true } });
      if (!currentPage || currentPage.type !== DocumentNodeType.PAGE) throw new DocumentServiceError("صفحه پیدا نشد.");
      const image = await tx.documentImage.create({
        data: {
          documentId: input.documentId,
          storedFileName: stored.storedFileName,
          originalFileName: input.originalFileName.trim().slice(0, 255) || "image",
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          width: stored.width,
          height: stored.height,
          createdById: input.adminId,
        },
        select: { id: true, byteSize: true, width: true, height: true },
      });
      await tx.auditLog.create({ data: { actorUserId: input.adminId, entityType: "DocumentImage", entityId: image.id, action: "DOCUMENT_IMAGE_UPLOADED", newValue: { documentId: input.documentId, byteSize: image.byteSize, width: image.width, height: image.height, mimeType: "image/webp" } } });
      return { ...image, src: `/api/document-images/${encodeURIComponent(image.id)}` };
    });
  } catch (error) {
    await deleteStoredDocumentImage(stored.storedFileName).catch(() => undefined);
    throw error;
  }
}

export async function deleteDocumentImage(input: { adminId: string; imageId: string }) {
  let storedFileName = "";
  await db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const image = await tx.documentImage.findUnique({ where: { id: input.imageId }, select: { id: true, documentId: true, storedFileName: true } });
    if (!image) throw new DocumentServiceError("تصویر پیدا نشد.");
    storedFileName = image.storedFileName;
    await tx.documentImage.delete({ where: { id: image.id } });
    await tx.auditLog.create({ data: { actorUserId: input.adminId, entityType: "DocumentImage", entityId: image.id, action: "DOCUMENT_IMAGE_DELETED", oldValue: { documentId: image.documentId } } });
  });
  await deleteStoredDocumentImage(storedFileName).catch(() => undefined);
}

export type { ValidatedDocumentContent };
