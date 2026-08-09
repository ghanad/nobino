import "server-only";

import type { Prisma, UserRole } from "@prisma/client";

import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import {
  createEmptyWikiContent,
  extractWikiPlainText,
  slugifyWikiTitle,
  validateWikiContentJson,
} from "@/lib/wiki-content";

type DbClient = typeof db | Prisma.TransactionClient;

export class WikiPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikiPermissionError";
  }
}

export class WikiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikiValidationError";
  }
}

export type WikiPageSummary = {
  contentText: string;
  deletedAt: Date | null;
  id: string;
  isHidden: boolean;
  parentId: string | null;
  slug: string;
  sortOrder: number;
  title: string;
};

export type WikiPageTreeNode = WikiPageSummary & {
  children: WikiPageTreeNode[];
};

export type WikiParentOption = {
  depth: number;
  id: string;
  isHidden: boolean;
  label: string;
  slug: string;
};

export type WikiPageRevisionSummary = {
  contentText: string;
  createdAt: Date;
  editorName: string;
  id: string;
  title: string;
};

export type WikiPageView = {
  ancestors: WikiPageSummary[];
  contentJson: Prisma.JsonValue;
  contentText: string;
  createdAt: Date;
  createdByName: string;
  deletedAt: Date | null;
  id: string;
  isHidden: boolean;
  isHiddenByAncestor: boolean;
  parentId: string | null;
  slug: string;
  sortOrder: number;
  title: string;
  updatedAt: Date;
  updatedByName: string;
  children: WikiPageSummary[];
  tree: WikiPageTreeNode[];
};

type WikiPageRecord = WikiPageSummary & {
  parentId: string | null;
};

function isWikiAdmin(role: UserRole): boolean {
  return role === "ADMIN";
}

function assertWikiAdmin(user: Pick<CurrentUser, "role">): void {
  if (!isWikiAdmin(user.role)) {
    throw new WikiPermissionError("فقط مدیران می‌توانند دانشنامه را مدیریت کنند.");
  }
}

function mapWikiPage(record: WikiPageRecord): WikiPageSummary {
  return {
    contentText: record.contentText,
    deletedAt: record.deletedAt,
    id: record.id,
    isHidden: record.isHidden,
    parentId: record.parentId,
    slug: record.slug,
    sortOrder: record.sortOrder,
    title: record.title,
  };
}

function sortWikiPages<T extends { sortOrder: number; title: string; slug: string }>(
  pages: T[],
): T[] {
  return [...pages].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    const titleOrder = left.title.localeCompare(right.title, "fa");

    if (titleOrder !== 0) {
      return titleOrder;
    }

    return left.slug.localeCompare(right.slug, "fa");
  });
}

function buildWikiTree(pages: WikiPageRecord[]): WikiPageTreeNode[] {
  const nodes = new Map<string, WikiPageTreeNode>();

  for (const page of pages) {
    nodes.set(page.id, {
      ...mapWikiPage(page),
      children: [],
    });
  }

  const roots: WikiPageTreeNode[] = [];

  for (const page of pages) {
    const node = nodes.get(page.id);

    if (!node) {
      continue;
    }

    const parent = page.parentId ? nodes.get(page.parentId) : null;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (nodesToSort: WikiPageTreeNode[]): WikiPageTreeNode[] =>
    sortWikiPages(nodesToSort).map((node) => ({
      ...node,
      children: sortTree(node.children),
    }));

  return sortTree(roots);
}

function filterVisibleWikiTree(
  tree: WikiPageTreeNode[],
  options: { ancestorHidden: boolean; includeHidden: boolean },
): WikiPageTreeNode[] {
  const filtered: WikiPageTreeNode[] = [];

  for (const node of tree) {
    const isHiddenForViewer = options.ancestorHidden || node.isHidden;

    if (!options.includeHidden && isHiddenForViewer) {
      continue;
    }

    filtered.push({
      ...node,
      children: filterVisibleWikiTree(node.children, {
        ancestorHidden: isHiddenForViewer,
        includeHidden: options.includeHidden,
      }),
    });
  }

  return filtered;
}

function flattenWikiTree(
  tree: WikiPageTreeNode[],
  depth = 0,
): WikiParentOption[] {
  const options: WikiParentOption[] = [];

  for (const node of tree) {
    options.push({
      depth,
      id: node.id,
      isHidden: node.isHidden,
      label: node.title,
      slug: node.slug,
    });

    options.push(...flattenWikiTree(node.children, depth + 1));
  }

  return options;
}

async function fetchActiveWikiPages(client: DbClient = db): Promise<WikiPageRecord[]> {
  return client.wikiPage.findMany({
    where: { deletedAt: null },
    select: {
      contentText: true,
      deletedAt: true,
      id: true,
      isHidden: true,
      parentId: true,
      slug: true,
      sortOrder: true,
      title: true,
    },
  });
}

function getWikiDescendantIdsFromTree(
  tree: WikiPageTreeNode[],
  pageId: string,
): string[] {
  const descendants: string[] = [];

  const visit = (nodes: WikiPageTreeNode[], ancestorFound: boolean) => {
    for (const node of nodes) {
      const currentAncestorFound = ancestorFound || node.id === pageId;

      if (currentAncestorFound && node.id !== pageId) {
        descendants.push(node.id);
      }

      visit(node.children, currentAncestorFound);
    }
  };

  visit(tree, false);

  return descendants;
}

function getWikiPageAncestors(
  page: WikiPageSummary,
  pagesById: Map<string, WikiPageSummary>,
): WikiPageSummary[] {
  const ancestors: WikiPageSummary[] = [];
  let currentParentId = page.parentId;

  while (currentParentId) {
    const parent = pagesById.get(currentParentId);

    if (!parent) {
      break;
    }

    ancestors.unshift(parent);
    currentParentId = parent.parentId;
  }

  return ancestors;
}

function isWikiSubtreeHiddenForViewer(
  page: WikiPageSummary,
  pagesById: Map<string, WikiPageSummary>,
  role: UserRole,
): boolean {
  if (isWikiAdmin(role)) {
    return false;
  }

  if (page.isHidden) {
    return true;
  }

  let currentParentId = page.parentId;

  while (currentParentId) {
    const parent = pagesById.get(currentParentId);

    if (!parent) {
      break;
    }

    if (parent.isHidden) {
      return true;
    }

    currentParentId = parent.parentId;
  }

  return false;
}

async function getWikiPageBySlugInternal(
  slug: string,
  client: DbClient = db,
): Promise<{
  page: WikiPageView | null;
  pages: WikiPageRecord[];
  tree: WikiPageTreeNode[];
}> {
  const [pages, pageRecord] = await Promise.all([
    fetchActiveWikiPages(client),
    client.wikiPage.findUnique({
      where: { slug },
      select: {
        contentJson: true,
        contentText: true,
        createdAt: true,
        createdBy: {
          select: {
            name: true,
          },
        },
        deletedAt: true,
        id: true,
        isHidden: true,
        parentId: true,
        slug: true,
        sortOrder: true,
        title: true,
        updatedAt: true,
        updatedBy: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const tree = buildWikiTree(pages);

  if (!pageRecord || pageRecord.deletedAt) {
    return { page: null, pages, tree };
  }

  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const pageSummary = mapWikiPage(pageRecord);

  return {
    page: {
      ancestors: getWikiPageAncestors(pageSummary, pagesById),
      children: pages
        .filter((candidate) => candidate.parentId === pageSummary.id)
        .sort((left, right) =>
          left.sortOrder === right.sortOrder
            ? left.title.localeCompare(right.title, "fa")
            : left.sortOrder - right.sortOrder,
        ),
      contentJson: pageRecord.contentJson,
      contentText: pageRecord.contentText,
      createdAt: pageRecord.createdAt,
      createdByName: pageRecord.createdBy.name,
      deletedAt: pageRecord.deletedAt,
      id: pageRecord.id,
      isHidden: pageRecord.isHidden,
      isHiddenByAncestor: isWikiSubtreeHiddenForViewer(
        pageSummary,
        pagesById,
        "USER",
      ),
      parentId: pageRecord.parentId,
      slug: pageRecord.slug,
      sortOrder: pageRecord.sortOrder,
      title: pageRecord.title,
      tree,
      updatedAt: pageRecord.updatedAt,
      updatedByName: pageRecord.updatedBy.name,
    },
    pages,
    tree,
  };
}

async function generateUniqueWikiSlug(
  title: string,
  client: DbClient = db,
  preferredSlug?: string,
): Promise<string> {
  const baseSlug = slugifyWikiTitle(preferredSlug?.trim() || title);
  let suffix = 0;

  while (true) {
    const candidateSlug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const existing = await client.wikiPage.findUnique({
      where: { slug: candidateSlug },
      select: { id: true },
    });

    if (!existing) {
      return candidateSlug;
    }

    suffix += 1;
  }
}

async function ensureWikiParentIsValid(
  pageId: string,
  parentId: string | null,
  client: DbClient = db,
): Promise<void> {
  if (!parentId) {
    return;
  }

  if (parentId === pageId) {
    throw new WikiValidationError("یک صفحه نمی‌تواند والد خودش باشد.");
  }

  const [pages, parent] = await Promise.all([
    fetchActiveWikiPages(client),
    client.wikiPage.findUnique({
      where: { id: parentId },
      select: {
        deletedAt: true,
        id: true,
        parentId: true,
      },
    }),
  ]);

  if (!parent || parent.deletedAt) {
    throw new WikiValidationError("والد انتخاب‌شده معتبر نیست.");
  }

  const pagesById = new Map(pages.map((page) => [page.id, page]));
  let currentParentId = parent.parentId;

  while (currentParentId) {
    if (currentParentId === pageId) {
      throw new WikiValidationError("این جابه‌جایی چرخه درختی ایجاد می‌کند.");
    }

    currentParentId = pagesById.get(currentParentId)?.parentId ?? null;
  }
}

async function getNextWikiSortOrder(
  parentId: string | null,
  client: DbClient = db,
): Promise<number> {
  const siblings = await client.wikiPage.findMany({
    where: {
      deletedAt: null,
      parentId,
    },
    select: {
      sortOrder: true,
    },
  });

  return siblings.length === 0
    ? 0
    : Math.max(...siblings.map((page) => page.sortOrder)) + 1;
}

async function writeWikiAuditLog(
  client: DbClient,
  input: {
    action: string;
    actorId: string;
    newValue?: Prisma.JsonObject;
    oldValue?: Prisma.JsonObject;
    pageId: string;
  },
): Promise<void> {
  await client.auditLog.create({
    data: {
      action: input.action,
      actorUserId: input.actorId,
      entityId: input.pageId,
      entityType: "WikiPage",
      newValue: input.newValue,
      oldValue: input.oldValue,
    },
  });
}

function mapWikiPageRevision(record: {
  contentText: string;
  createdAt: Date;
  editor: { name: string };
  id: string;
  title: string;
}): WikiPageRevisionSummary {
  return {
    contentText: record.contentText,
    createdAt: record.createdAt,
    editorName: record.editor.name,
    id: record.id,
    title: record.title,
  };
}

export async function getWikiTreeForUser(
  user: Pick<CurrentUser, "role">,
  client: DbClient = db,
): Promise<WikiPageTreeNode[]> {
  const pages = await fetchActiveWikiPages(client);
  const tree = buildWikiTree(pages);

  return filterVisibleWikiTree(tree, {
    ancestorHidden: false,
    includeHidden: isWikiAdmin(user.role),
  });
}

export async function getWikiParentOptionsForUser(
  user: Pick<CurrentUser, "role">,
  excludedPageId: string | null = null,
  client: DbClient = db,
): Promise<WikiParentOption[]> {
  const pages = await fetchActiveWikiPages(client);
  const tree = filterVisibleWikiTree(buildWikiTree(pages), {
    ancestorHidden: false,
    includeHidden: isWikiAdmin(user.role),
  });

  if (!excludedPageId) {
    return flattenWikiTree(tree);
  }

  const excludedIds = new Set(getWikiDescendantIdsFromTree(tree, excludedPageId));
  excludedIds.add(excludedPageId);

  const filteredTree = tree
    .map((node) => {
      const prune = (candidate: WikiPageTreeNode): WikiPageTreeNode | null => {
        if (excludedIds.has(candidate.id)) {
          return null;
        }

        return {
          ...candidate,
          children: candidate.children
            .map(prune)
            .filter((child): child is WikiPageTreeNode => child !== null),
        };
      };

      return prune(node);
    })
    .filter((node): node is WikiPageTreeNode => node !== null);

  return flattenWikiTree(filteredTree);
}

export async function getWikiLandingSlug(
  user: Pick<CurrentUser, "role">,
  client: DbClient = db,
): Promise<string | null> {
  const tree = await getWikiTreeForUser(user, client);
  const firstVisibleRoot = tree[0];

  return firstVisibleRoot?.slug ?? null;
}

export async function getWikiPageViewBySlug(
  slug: string,
  user: Pick<CurrentUser, "role">,
  client: DbClient = db,
): Promise<WikiPageView | null> {
  const { page, pages, tree } = await getWikiPageBySlugInternal(slug, client);

  if (!page) {
    return null;
  }

  const pageSummary = {
    contentText: page.contentText,
    deletedAt: page.deletedAt,
    id: page.id,
    isHidden: page.isHidden,
    parentId: page.parentId,
    slug: page.slug,
    sortOrder: page.sortOrder,
    title: page.title,
  };

  const pagesById = new Map(pages.map((candidate) => [candidate.id, candidate]));
  const isHiddenByAncestor = isWikiSubtreeHiddenForViewer(
    pageSummary,
    pagesById,
    user.role,
  );

  if (isHiddenByAncestor) {
    return null;
  }

  const visibleTree = filterVisibleWikiTree(tree, {
    ancestorHidden: false,
    includeHidden: isWikiAdmin(user.role),
  });

  const visibleChildren = sortWikiPages(
    pages.filter((candidate) => {
      if (candidate.parentId !== page.id) {
        return false;
      }

      return !isWikiSubtreeHiddenForViewer(candidate, pagesById, user.role);
    }),
  );

  return {
    ...page,
    children: visibleChildren,
    isHiddenByAncestor: false,
    tree: visibleTree,
  };
}

export async function getWikiPageEditorContext(
  slug: string,
  user: CurrentUser,
  client: DbClient = db,
): Promise<{
  page: WikiPageView | null;
  parentOptions: WikiParentOption[];
}> {
  assertWikiAdmin(user);

  const page = await getWikiPageViewBySlug(slug, user, client);
  const parentOptions = await getWikiParentOptionsForUser(
    user,
    page?.id ?? null,
    client,
  );

  return {
    page,
    parentOptions,
  };
}

export async function getWikiPageCreateContext(
  user: CurrentUser,
  parentSlug: string | null,
  client: DbClient = db,
): Promise<{
  defaultParentId: string | null;
  parentOptions: WikiParentOption[];
}> {
  assertWikiAdmin(user);

  const [pages, parentOptions] = await Promise.all([
    fetchActiveWikiPages(client),
    getWikiParentOptionsForUser(user, null, client),
  ]);

  const parent = parentSlug ? pages.find((page) => page.slug === parentSlug) ?? null : null;

  return {
    defaultParentId: parent?.id ?? null,
    parentOptions,
  };
}

export async function getWikiPageHistory(
  slug: string,
  user: CurrentUser,
  client: DbClient = db,
): Promise<{
  page: WikiPageView | null;
  revisions: WikiPageRevisionSummary[];
}> {
  assertWikiAdmin(user);

  const page = await getWikiPageViewBySlug(slug, user, client);

  if (!page) {
    return {
      page: null,
      revisions: [],
    };
  }

  const revisions = await client.wikiPageRevision.findMany({
    where: { wikiPageId: page.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      contentText: true,
      createdAt: true,
      editor: {
        select: {
          name: true,
        },
      },
      id: true,
      title: true,
    },
  });

  return {
    page,
    revisions: revisions.map(mapWikiPageRevision),
  };
}

export async function createWikiPage(
  input: {
    contentJson?: unknown;
    isHidden?: boolean;
    parentId?: string | null;
    slug?: string;
    title: string;
  },
  actor: CurrentUser,
): Promise<WikiPageView> {
  assertWikiAdmin(actor);

  const title = input.title.trim();

  if (!title) {
    throw new WikiValidationError("عنوان صفحه نمی‌تواند خالی باشد.");
  }

  const contentJson = validateWikiContentJson(
    input.contentJson ?? createEmptyWikiContent(),
  );
  const contentText = extractWikiPlainText(contentJson);
  const parentId = input.parentId?.trim() ? input.parentId.trim() : null;

  const page = await db.$transaction(async (tx) => {
    const slug = await generateUniqueWikiSlug(title, tx, input.slug);

    if (parentId) {
      await ensureWikiParentIsValid("new-page", parentId, tx);
    }

    const sortOrder = await getNextWikiSortOrder(parentId, tx);

    const createdPage = await tx.wikiPage.create({
      data: {
        contentJson,
        contentText,
        createdById: actor.id,
        isHidden: input.isHidden ?? false,
        parentId,
        slug,
        sortOrder,
        title,
        updatedById: actor.id,
      },
      select: {
        contentJson: true,
        contentText: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        deletedAt: true,
        id: true,
        isHidden: true,
        parentId: true,
        slug: true,
        sortOrder: true,
        title: true,
        updatedAt: true,
        updatedBy: { select: { name: true } },
      },
    });

    await tx.wikiPageRevision.create({
      data: {
        contentJson,
        contentText,
        editorId: actor.id,
        title,
        wikiPageId: createdPage.id,
      },
    });

    await writeWikiAuditLog(tx, {
      action: "WIKI_PAGE_CREATED",
      actorId: actor.id,
      newValue: {
        parentId,
        slug,
        title,
      },
      pageId: createdPage.id,
    });

    return createdPage;
  });

  const pages = await fetchActiveWikiPages(db);
  const pagesById = new Map(pages.map((candidate) => [candidate.id, candidate]));

  return {
    ancestors: getWikiPageAncestors(mapWikiPage(page), pagesById),
    children: [],
    contentJson: page.contentJson,
    contentText: page.contentText,
    createdAt: page.createdAt,
    createdByName: page.createdBy.name,
    deletedAt: page.deletedAt,
    id: page.id,
    isHidden: page.isHidden,
    isHiddenByAncestor: false,
    parentId: page.parentId,
    slug: page.slug,
    sortOrder: page.sortOrder,
    title: page.title,
    tree: buildWikiTree(pages),
    updatedAt: page.updatedAt,
    updatedByName: page.updatedBy.name,
  };
}

export async function updateWikiPage(
  input: {
    contentJson?: unknown;
    isHidden: boolean;
    pageId: string;
    parentId?: string | null;
    title: string;
  },
  actor: CurrentUser,
): Promise<WikiPageView> {
  assertWikiAdmin(actor);

  const title = input.title.trim();

  if (!title) {
    throw new WikiValidationError("عنوان صفحه نمی‌تواند خالی باشد.");
  }

  const contentJson = validateWikiContentJson(
    input.contentJson ?? createEmptyWikiContent(),
  );
  const contentText = extractWikiPlainText(contentJson);

  const parentId = input.parentId?.trim() ? input.parentId.trim() : null;

  const updatedPage = await db.$transaction(async (tx) => {
    const page = await tx.wikiPage.findUnique({
      where: { id: input.pageId },
      select: {
        contentJson: true,
        contentText: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        deletedAt: true,
        id: true,
        isHidden: true,
        parentId: true,
        slug: true,
        sortOrder: true,
        title: true,
        updatedAt: true,
        updatedBy: { select: { name: true } },
      },
    });

    if (!page || page.deletedAt) {
      throw new WikiValidationError("صفحه پیدا نشد.");
    }

    if (parentId !== page.parentId) {
      await ensureWikiParentIsValid(page.id, parentId, tx);
    }

    const sortOrder =
      parentId === page.parentId
        ? page.sortOrder
        : await getNextWikiSortOrder(parentId, tx);

    const titleChanged = page.title !== title;
    const contentChanged =
      JSON.stringify(page.contentJson) !== JSON.stringify(contentJson) ||
      page.contentText !== contentText;

    await tx.wikiPage.update({
      where: { id: page.id },
      data: {
        contentJson,
        contentText,
        isHidden: input.isHidden,
        parentId,
        sortOrder,
        title,
        updatedById: actor.id,
      },
    });

    if (titleChanged || contentChanged) {
      await tx.wikiPageRevision.create({
        data: {
          contentJson,
          contentText,
          editorId: actor.id,
          title,
          wikiPageId: page.id,
        },
      });
    }

    if (page.isHidden !== input.isHidden) {
      await writeWikiAuditLog(tx, {
        action: input.isHidden ? "WIKI_PAGE_HIDDEN" : "WIKI_PAGE_SHOWN",
        actorId: actor.id,
        newValue: {
          isHidden: input.isHidden,
        },
        oldValue: {
          isHidden: page.isHidden,
        },
        pageId: page.id,
      });
    }

    if (page.parentId !== parentId) {
      await writeWikiAuditLog(tx, {
        action: "WIKI_PAGE_MOVED",
        actorId: actor.id,
        newValue: { parentId },
        oldValue: { parentId: page.parentId },
        pageId: page.id,
      });
    }

    await writeWikiAuditLog(tx, {
      action: "WIKI_PAGE_UPDATED",
      actorId: actor.id,
      newValue: {
        isHidden: input.isHidden,
        parentId,
        title,
      },
      oldValue: {
        isHidden: page.isHidden,
        parentId: page.parentId,
        title: page.title,
      },
      pageId: page.id,
    });

    return tx.wikiPage.findUniqueOrThrow({
      where: { id: page.id },
      select: {
        contentJson: true,
        contentText: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        deletedAt: true,
        id: true,
        isHidden: true,
        parentId: true,
        slug: true,
        sortOrder: true,
        title: true,
        updatedAt: true,
        updatedBy: { select: { name: true } },
      },
    });
  });

  const pages = await fetchActiveWikiPages(db);
  const pagesById = new Map(pages.map((candidate) => [candidate.id, candidate]));

  return {
    ancestors: getWikiPageAncestors(mapWikiPage(updatedPage), pagesById),
    children: pages
      .filter((candidate) => candidate.parentId === updatedPage.id)
      .sort((left, right) =>
        left.sortOrder === right.sortOrder
          ? left.title.localeCompare(right.title, "fa")
          : left.sortOrder - right.sortOrder,
      ),
    contentJson: updatedPage.contentJson,
    contentText: updatedPage.contentText,
    createdAt: updatedPage.createdAt,
    createdByName: updatedPage.createdBy.name,
    deletedAt: updatedPage.deletedAt,
    id: updatedPage.id,
    isHidden: updatedPage.isHidden,
    isHiddenByAncestor: isWikiSubtreeHiddenForViewer(
      mapWikiPage(updatedPage),
      pagesById,
      actor.role,
    ),
    parentId: updatedPage.parentId,
    slug: updatedPage.slug,
    sortOrder: updatedPage.sortOrder,
    title: updatedPage.title,
    tree: buildWikiTree(pages),
    updatedAt: updatedPage.updatedAt,
    updatedByName: updatedPage.updatedBy.name,
  };
}

export async function moveWikiPageSibling(
  input: {
    direction: "down" | "up";
    pageId: string;
  },
  actor: CurrentUser,
): Promise<WikiPageView> {
  assertWikiAdmin(actor);

  const pages = await fetchActiveWikiPages(db);
  const page = pages.find((candidate) => candidate.id === input.pageId);

  if (!page) {
    throw new WikiValidationError("صفحه پیدا نشد.");
  }

  const siblings = sortWikiPages(
    pages.filter((candidate) => candidate.parentId === page.parentId),
  );
  const currentIndex = siblings.findIndex((candidate) => candidate.id === page.id);

  if (currentIndex === -1) {
    throw new WikiValidationError("صفحه در فهرست خواهر/برادرها پیدا نشد.");
  }

  const targetIndex = input.direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= siblings.length) {
    throw new WikiValidationError("جابه‌جایی در این جهت ممکن نیست.");
  }

  const target = siblings[targetIndex];

  await db.$transaction(async (tx) => {
    await Promise.all([
      tx.wikiPage.update({
        where: { id: page.id },
        data: { sortOrder: target.sortOrder, updatedById: actor.id },
      }),
      tx.wikiPage.update({
        where: { id: target.id },
        data: { sortOrder: page.sortOrder, updatedById: actor.id },
      }),
    ]);

    await writeWikiAuditLog(tx, {
      action: "WIKI_PAGE_MOVED",
      actorId: actor.id,
      newValue: {
        direction: input.direction,
        pageId: page.id,
        siblingId: target.id,
      },
      oldValue: {
        pageId: page.id,
        siblingId: target.id,
      },
      pageId: page.id,
    });
  });

  const refreshed = await db.wikiPage.findUniqueOrThrow({
    where: { id: page.id },
    select: {
      contentJson: true,
      contentText: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      deletedAt: true,
      id: true,
      isHidden: true,
      parentId: true,
      slug: true,
      sortOrder: true,
      title: true,
      updatedAt: true,
      updatedBy: { select: { name: true } },
    },
  });

  const refreshedPages = await fetchActiveWikiPages(db);
  const pagesById = new Map(refreshedPages.map((candidate) => [candidate.id, candidate]));
  const visibleChildren = sortWikiPages(
    refreshedPages.filter((candidate) => candidate.parentId === refreshed.id),
  );

  return {
    ancestors: getWikiPageAncestors(mapWikiPage(refreshed), pagesById),
    children: visibleChildren,
    contentJson: refreshed.contentJson,
    contentText: refreshed.contentText,
    createdAt: refreshed.createdAt,
    createdByName: refreshed.createdBy.name,
    deletedAt: refreshed.deletedAt,
    id: refreshed.id,
    isHidden: refreshed.isHidden,
    isHiddenByAncestor: isWikiSubtreeHiddenForViewer(
      mapWikiPage(refreshed),
      pagesById,
      actor.role,
    ),
    parentId: refreshed.parentId,
    slug: refreshed.slug,
    sortOrder: refreshed.sortOrder,
    title: refreshed.title,
    tree: buildWikiTree(refreshedPages),
    updatedAt: refreshed.updatedAt,
    updatedByName: refreshed.updatedBy.name,
  };
}

export async function toggleWikiPageHidden(
  input: {
    pageId: string;
    isHidden: boolean;
  },
  actor: CurrentUser,
): Promise<WikiPageView> {
  assertWikiAdmin(actor);

  const page = await db.wikiPage.findUnique({
    where: { id: input.pageId },
    select: {
      contentJson: true,
      contentText: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      deletedAt: true,
      id: true,
      isHidden: true,
      parentId: true,
      slug: true,
      sortOrder: true,
      title: true,
      updatedAt: true,
      updatedBy: { select: { name: true } },
    },
  });

  if (!page || page.deletedAt) {
    throw new WikiValidationError("صفحه پیدا نشد.");
  }

  if (page.isHidden === input.isHidden) {
    return getWikiPageViewBySlug(page.slug, actor) as Promise<WikiPageView>;
  }

  await db.$transaction(async (tx) => {
    await tx.wikiPage.update({
      where: { id: page.id },
      data: {
        isHidden: input.isHidden,
        updatedById: actor.id,
      },
    });

    await writeWikiAuditLog(tx, {
      action: input.isHidden ? "WIKI_PAGE_HIDDEN" : "WIKI_PAGE_SHOWN",
      actorId: actor.id,
      newValue: {
        isHidden: input.isHidden,
      },
      oldValue: {
        isHidden: page.isHidden,
      },
      pageId: page.id,
    });
  });

  return getWikiPageViewBySlug(page.slug, actor) as Promise<WikiPageView>;
}

export async function deleteWikiPage(
  input: {
    pageId: string;
  },
  actor: CurrentUser,
): Promise<{
  parentSlug: string | null;
}> {
  assertWikiAdmin(actor);

  const page = await db.wikiPage.findUnique({
    where: { id: input.pageId },
    select: {
      deletedAt: true,
      id: true,
      parent: {
        select: {
          slug: true,
        },
      },
      slug: true,
    },
  });

  if (!page || page.deletedAt) {
    throw new WikiValidationError("صفحه پیدا نشد.");
  }

  const childCount = await db.wikiPage.count({
    where: {
      deletedAt: null,
      parentId: page.id,
    },
  });

  if (childCount > 0) {
    throw new WikiValidationError(
      "برای حذف این صفحه ابتدا باید فرزندان فعال آن را جابه‌جا یا حذف کنید.",
    );
  }

  await db.$transaction(async (tx) => {
    await tx.wikiPage.update({
      where: { id: page.id },
      data: {
        deletedAt: new Date(),
        updatedById: actor.id,
      },
    });

    await writeWikiAuditLog(tx, {
      action: "WIKI_PAGE_DELETED",
      actorId: actor.id,
      newValue: {
        deletedAt: new Date().toISOString(),
      },
      oldValue: {
        deletedAt: null,
      },
      pageId: page.id,
    });
  });

  return {
    parentSlug: page.parent?.slug ?? null,
  };
}

export async function getWikiPageRevisions(
  pageId: string,
  actor: CurrentUser,
  client: DbClient = db,
): Promise<WikiPageRevisionSummary[]> {
  assertWikiAdmin(actor);

  const revisions = await client.wikiPageRevision.findMany({
    where: { wikiPageId: pageId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      contentText: true,
      createdAt: true,
      editor: {
        select: {
          name: true,
        },
      },
      id: true,
      title: true,
    },
  });

  return revisions.map(mapWikiPageRevision);
}
