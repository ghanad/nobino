import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  extractWikiPlainText,
  validateWikiContentJson,
} from "@/lib/wiki-content";
import { WikiPermissionError, WikiValidationError } from "@/lib/wiki-service";

const WIKI_EXPORT_FORMAT = "nobino-wiki";
const WIKI_EXPORT_VERSION = 1;
const MAX_IMPORT_PAGES = 2_000;

const wikiImportPageSchema = z.object({
  contentJson: z.unknown(),
  isHidden: z.boolean(),
  parentSlug: z.string().min(1).max(200).nullable(),
  slug: z.string().min(1).max(200),
  sortOrder: z.number().int().min(0),
  title: z.string().trim().min(1).max(150),
});

const wikiImportSchema = z.object({
  exportedAt: z.string().datetime(),
  format: z.literal(WIKI_EXPORT_FORMAT),
  pages: z.array(wikiImportPageSchema).max(MAX_IMPORT_PAGES),
  version: z.literal(WIKI_EXPORT_VERSION),
});

export type WikiExportFile = z.infer<typeof wikiImportSchema>;

export type WikiImportResult = {
  created: number;
  unchanged: number;
  updated: number;
};

function assertWikiAdmin(actor: Pick<CurrentUser, "role">): void {
  if (actor.role !== "ADMIN") {
    throw new WikiPermissionError("فقط مدیران می‌توانند دانشنامه را منتقل کنند.");
  }
}

function validateHierarchy(pages: WikiExportFile["pages"]): void {
  const parentBySlug = new Map<string, string | null>();

  for (const page of pages) {
    if (parentBySlug.has(page.slug)) {
      throw new WikiValidationError(`شناسهٔ مسیر «${page.slug}» تکراری است.`);
    }

    parentBySlug.set(page.slug, page.parentSlug);
  }

  for (const page of pages) {
    if (page.parentSlug && !parentBySlug.has(page.parentSlug)) {
      throw new WikiValidationError(
        `والد صفحهٔ «${page.title}» در فایل خروجی وجود ندارد.`,
      );
    }

    const visited = new Set<string>();
    let cursor: string | null = page.slug;

    while (cursor) {
      if (visited.has(cursor)) {
        throw new WikiValidationError("ساختار والد و فرزند فایل دارای چرخه است.");
      }

      visited.add(cursor);
      cursor = parentBySlug.get(cursor) ?? null;
    }
  }
}

export async function exportWiki(
  actor: CurrentUser,
): Promise<WikiExportFile> {
  assertWikiAdmin(actor);

  const pages = await db.wikiPage.findMany({
    where: { deletedAt: null },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    select: {
      contentJson: true,
      isHidden: true,
      parent: { select: { slug: true } },
      slug: true,
      sortOrder: true,
      title: true,
    },
  });

  return {
    exportedAt: new Date().toISOString(),
    format: WIKI_EXPORT_FORMAT,
    pages: pages.map((page) => ({
      contentJson: page.contentJson,
      isHidden: page.isHidden,
      parentSlug: page.parent?.slug ?? null,
      slug: page.slug,
      sortOrder: page.sortOrder,
      title: page.title,
    })),
    version: WIKI_EXPORT_VERSION,
  };
}

export function parseWikiImportFile(value: unknown): WikiExportFile {
  const parsed = wikiImportSchema.safeParse(value);

  if (!parsed.success) {
    throw new WikiValidationError(
      "فایل انتخاب‌شده خروجی معتبر دانشنامه نوبینو نیست.",
    );
  }

  validateHierarchy(parsed.data.pages);

  return {
    ...parsed.data,
    pages: parsed.data.pages.map((page) => ({
      ...page,
      contentJson: validateWikiContentJson(page.contentJson),
    })),
  };
}

export async function importWiki(
  input: WikiExportFile,
  actor: CurrentUser,
): Promise<WikiImportResult> {
  assertWikiAdmin(actor);
  validateHierarchy(input.pages);

  const preparedPages = input.pages.map((page) => {
    const contentJson = validateWikiContentJson(page.contentJson);

    return {
      ...page,
      contentJson,
      contentText: extractWikiPlainText(contentJson),
    };
  });

  return db.$transaction(async (tx) => {
    const existingPages = await tx.wikiPage.findMany({
      where: { slug: { in: preparedPages.map((page) => page.slug) } },
      select: {
        contentJson: true,
        contentText: true,
        deletedAt: true,
        id: true,
        isHidden: true,
        parent: { select: { slug: true } },
        slug: true,
        sortOrder: true,
        title: true,
      },
    });
    const existingBySlug = new Map(existingPages.map((page) => [page.slug, page]));
    const idBySlug = new Map<string, string>();
    let created = 0;
    let unchanged = 0;
    let updated = 0;

    for (const page of preparedPages) {
      const existing = existingBySlug.get(page.slug);

      if (existing) {
        idBySlug.set(page.slug, existing.id);
        continue;
      }

      const createdPage = await tx.wikiPage.create({
        data: {
          contentJson: page.contentJson,
          contentText: page.contentText,
          createdById: actor.id,
          isHidden: page.isHidden,
          parentId: null,
          slug: page.slug,
          sortOrder: page.sortOrder,
          title: page.title,
          updatedById: actor.id,
        },
        select: { id: true },
      });

      idBySlug.set(page.slug, createdPage.id);
      created += 1;

      await tx.wikiPageRevision.create({
        data: {
          contentJson: page.contentJson,
          contentText: page.contentText,
          editorId: actor.id,
          title: page.title,
          wikiPageId: createdPage.id,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "WIKI_PAGE_IMPORTED_CREATED",
          actorUserId: actor.id,
          entityId: createdPage.id,
          entityType: "WikiPage",
          newValue: { slug: page.slug, title: page.title },
        },
      });
    }

    for (const page of preparedPages) {
      const pageId = idBySlug.get(page.slug);
      const parentId = page.parentSlug ? idBySlug.get(page.parentSlug) : null;

      if (!pageId || (page.parentSlug && !parentId)) {
        throw new WikiValidationError("ساختار فایل دانشنامه کامل نیست.");
      }

      const existing = existingBySlug.get(page.slug);

      if (!existing) {
        if (parentId) {
          await tx.wikiPage.update({ where: { id: pageId }, data: { parentId } });
        }
        continue;
      }

      const contentChanged =
        JSON.stringify(existing.contentJson) !== JSON.stringify(page.contentJson) ||
        existing.contentText !== page.contentText;
      const changed =
        contentChanged ||
        existing.deletedAt !== null ||
        existing.isHidden !== page.isHidden ||
        (existing.parent?.slug ?? null) !== page.parentSlug ||
        existing.sortOrder !== page.sortOrder ||
        existing.title !== page.title;

      if (!changed) {
        unchanged += 1;
        continue;
      }

      await tx.wikiPage.update({
        where: { id: pageId },
        data: {
          contentJson: page.contentJson,
          contentText: page.contentText,
          deletedAt: null,
          isHidden: page.isHidden,
          parentId,
          sortOrder: page.sortOrder,
          title: page.title,
          updatedById: actor.id,
        },
      });
      updated += 1;

      if (contentChanged || existing.title !== page.title || existing.deletedAt) {
        await tx.wikiPageRevision.create({
          data: {
            contentJson: page.contentJson,
            contentText: page.contentText,
            editorId: actor.id,
            title: page.title,
            wikiPageId: pageId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          action: "WIKI_PAGE_IMPORTED_UPDATED",
          actorUserId: actor.id,
          entityId: pageId,
          entityType: "WikiPage",
          newValue: {
            isHidden: page.isHidden,
            parentSlug: page.parentSlug,
            slug: page.slug,
            sortOrder: page.sortOrder,
            title: page.title,
          } satisfies Prisma.JsonObject,
        },
      });
    }

    return { created, unchanged, updated };
  });
}
