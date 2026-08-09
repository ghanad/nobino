import assert from "node:assert/strict";
import { test } from "node:test";

import { UserRole } from "@prisma/client";
import type { JSONContent } from "@tiptap/core";

import { type CurrentUser } from "@/lib/auth";
import {
  createEmptyWikiContent,
  extractWikiPlainText,
} from "@/lib/wiki-content";
import {
  createWikiPage,
  deleteWikiPage,
  getWikiPageViewBySlug,
  getWikiTreeForUser,
  WikiPermissionError,
  WikiValidationError,
  updateWikiPage,
} from "@/lib/wiki-service";
import {
  exportWiki,
  importWiki,
  parseWikiImportFile,
} from "@/lib/wiki-transfer-service";

import {
  adminId,
  db,
  managerId,
  registerBusinessRuleTestHooks,
  userId,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

const adminActor: CurrentUser = {
  active: true,
  canViewLunchReport: false,
  email: "admin@example.test",
  id: adminId,
  name: "Admin User",
  role: UserRole.ADMIN,
};

const managerActor: CurrentUser = {
  active: true,
  canViewLunchReport: false,
  email: "manager@example.test",
  id: managerId,
  name: "Manager User",
  role: UserRole.MANAGER,
};

const userActor: CurrentUser = {
  active: true,
  canViewLunchReport: false,
  email: "user@example.test",
  id: userId,
  name: "Normal User",
  role: UserRole.USER,
};

const sampleContent: JSONContent = {
  content: [
    {
      attrs: {
        level: 1,
      },
      content: [{ text: "عنوان", type: "text" }],
      type: "heading",
    },
    {
      content: [
        { text: "متن ", type: "text" },
        { marks: [{ type: "bold" }], text: "پررنگ", type: "text" },
        { text: " و ", type: "text" },
        { marks: [{ type: "italic" }], text: "کج", type: "text" },
        { text: " با ", type: "text" },
        {
          marks: [{ attrs: { href: "https://example.com" }, type: "link" }],
          text: "پیوند",
          type: "text",
        },
      ],
      type: "paragraph",
    },
    {
      content: [
        {
          content: [
            {
              content: [{ text: "آیتم اول", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "listItem",
        },
        {
          content: [
            {
              content: [{ text: "آیتم دوم", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "listItem",
        },
      ],
      type: "bulletList",
    },
    {
      content: [
        {
          content: [
            {
              content: [{ text: "مرحله اول", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "listItem",
        },
        {
          content: [
            {
              content: [{ text: "مرحله دوم", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "listItem",
        },
      ],
      type: "orderedList",
    },
    {
      content: [
        {
          content: [{ text: "نقل‌قول", type: "text" }],
          type: "paragraph",
        },
      ],
      type: "blockquote",
    },
  ],
  type: "doc",
};

test("wiki export can recreate content and hierarchy in another database", async () => {
  const parent = await createWikiPage(
    {
      contentJson: sampleContent,
      isHidden: true,
      slug: "راهنمای-شرکت",
      title: "راهنمای شرکت",
    },
    adminActor,
  );
  const child = await createWikiPage(
    {
      contentJson: createEmptyWikiContent(),
      parentId: parent.id,
      slug: "فرآیند-مرخصی",
      title: "فرآیند مرخصی",
    },
    adminActor,
  );
  const exported = await exportWiki(adminActor);
  const portableFile = parseWikiImportFile(JSON.parse(JSON.stringify(exported)));

  await db.wikiPageRevision.deleteMany();
  await db.wikiPage.deleteMany();

  const result = await importWiki(portableFile, adminActor);
  const recreatedParent = await db.wikiPage.findUniqueOrThrow({
    where: { slug: parent.slug },
  });
  const recreatedChild = await db.wikiPage.findUniqueOrThrow({
    where: { slug: child.slug },
  });

  assert.deepEqual(result, { created: 2, unchanged: 0, updated: 0 });
  assert.equal(recreatedParent.isHidden, true);
  assert.equal(recreatedParent.contentText, extractWikiPlainText(sampleContent));
  assert.equal(recreatedChild.parentId, recreatedParent.id);
  assert.equal(await db.wikiPageRevision.count(), 2);
  assert.equal(
    await db.auditLog.count({ where: { action: "WIKI_PAGE_IMPORTED_CREATED" } }),
    2,
  );
});

test("wiki import merges by slug without deleting destination-only pages", async () => {
  const source = await createWikiPage(
    {
      contentJson: sampleContent,
      slug: "قوانین",
      title: "قوانین",
    },
    adminActor,
  );
  const exported = await exportWiki(adminActor);

  await updateWikiPage(
    {
      contentJson: createEmptyWikiContent(),
      isHidden: true,
      pageId: source.id,
      title: "قوانین قدیمی",
    },
    adminActor,
  );
  const destinationOnly = await createWikiPage(
    {
      contentJson: createEmptyWikiContent(),
      slug: "فقط-مقصد",
      title: "فقط مقصد",
    },
    adminActor,
  );

  const result = await importWiki(exported, adminActor);
  const restored = await db.wikiPage.findUniqueOrThrow({
    where: { slug: source.slug },
  });

  assert.deepEqual(result, { created: 0, unchanged: 0, updated: 1 });
  assert.equal(restored.title, "قوانین");
  assert.equal(restored.isHidden, false);
  assert.equal(restored.contentText, extractWikiPlainText(sampleContent));
  assert.ok(await db.wikiPage.findUnique({ where: { id: destinationOnly.id } }));
});

test("wiki transfer rejects invalid hierarchy and non-admin actors", async () => {
  await assert.rejects(() => exportWiki(managerActor), WikiPermissionError);
  await assert.rejects(
    () => importWiki({ exportedAt: new Date().toISOString(), format: "nobino-wiki", pages: [], version: 1 }, userActor),
    WikiPermissionError,
  );
  assert.throws(
    () =>
      parseWikiImportFile({
        exportedAt: new Date().toISOString(),
        format: "nobino-wiki",
        pages: [
          {
            contentJson: createEmptyWikiContent(),
            isHidden: false,
            parentSlug: "missing-parent",
            slug: "child",
            sortOrder: 0,
            title: "فرزند",
          },
        ],
        version: 1,
      }),
    WikiValidationError,
  );
});

test("wiki permissions are enforced in the backend", async () => {
  const page = await createWikiPage(
    {
      contentJson: createEmptyWikiContent(),
      title: "صفحه تست",
    },
    adminActor,
  );

  await assert.rejects(
    () =>
      createWikiPage(
        {
          contentJson: createEmptyWikiContent(),
          title: "نامعتبر",
        },
        managerActor,
      ),
    WikiPermissionError,
  );

  await assert.rejects(
    () =>
      updateWikiPage(
        {
          contentJson: createEmptyWikiContent(),
          isHidden: false,
          pageId: page.id,
          title: "ویرایش نامعتبر",
        },
        userActor,
      ),
    WikiPermissionError,
  );

  await assert.rejects(
    () => deleteWikiPage({ pageId: page.id }, managerActor),
    WikiPermissionError,
  );
});

test("hidden parent hides the subtree for non-admin users", async () => {
  const parent = await createWikiPage(
    {
      contentJson: createEmptyWikiContent(),
      isHidden: true,
      title: "دسته مخفی",
    },
    adminActor,
  );
  const child = await createWikiPage(
    {
      contentJson: createEmptyWikiContent(),
      parentId: parent.id,
      title: "فرزند",
    },
    adminActor,
  );

  const userTree = await getWikiTreeForUser(userActor);
  const adminTree = await getWikiTreeForUser(adminActor);

  assert.equal(userTree.length, 0);
  assert.ok(adminTree.length > 0);
  assert.equal(adminTree[0].slug, parent.slug);
  assert.equal(adminTree[0].children[0].slug, child.slug);
  assert.equal(await getWikiPageViewBySlug(parent.slug, userActor), null);
  assert.equal(await getWikiPageViewBySlug(child.slug, userActor), null);
  assert.ok(await getWikiPageViewBySlug(child.slug, adminActor));
});

test("wiki cycle prevention rejects descendant reparenting", async () => {
  const root = await createWikiPage(
    {
      contentJson: createEmptyWikiContent(),
      title: "ریشه",
    },
    adminActor,
  );
  const child = await createWikiPage(
    {
      contentJson: createEmptyWikiContent(),
      parentId: root.id,
      title: "فرزند",
    },
    adminActor,
  );
  const grandChild = await createWikiPage(
    {
      contentJson: createEmptyWikiContent(),
      parentId: child.id,
      title: "نوه",
    },
    adminActor,
  );

  await assert.rejects(
    () =>
      updateWikiPage(
        {
          contentJson: createEmptyWikiContent(),
          isHidden: false,
          pageId: root.id,
          parentId: grandChild.id,
          title: "ریشه",
        },
        adminActor,
      ),
    WikiValidationError,
  );
});

test("wiki revisions are created and soft delete preserves them", async () => {
  const page = await createWikiPage(
    {
      contentJson: sampleContent,
      title: "راهنما",
    },
    adminActor,
  );

  const initialRevisionCount = await db.wikiPageRevision.count({
    where: { wikiPageId: page.id },
  });

  assert.equal(initialRevisionCount, 1);
  assert.equal(
    extractWikiPlainText(sampleContent),
    "عنوان\n\nمتن پررنگ و کج با پیوند\n\n- آیتم اول\n- آیتم دوم\n\n1. مرحله اول\n2. مرحله دوم\n\n> نقل‌قول",
  );

  await updateWikiPage(
    {
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "محتوای به‌روزشده" }],
          },
        ],
      },
      isHidden: false,
      pageId: page.id,
      title: "راهنمای به‌روز",
    },
    adminActor,
  );

  const updatedRevisionCount = await db.wikiPageRevision.count({
    where: { wikiPageId: page.id },
  });

  assert.equal(updatedRevisionCount, 2);

  await deleteWikiPage({ pageId: page.id }, adminActor);

  const deletedPage = await db.wikiPage.findUniqueOrThrow({
    select: { deletedAt: true },
    where: { id: page.id },
  });
  const revisionCountAfterDelete = await db.wikiPageRevision.count({
    where: { wikiPageId: page.id },
  });

  assert.ok(deletedPage.deletedAt);
  assert.equal(revisionCountAfterDelete, 2);
  assert.equal(await getWikiPageViewBySlug(page.slug, adminActor), null);
});

test("wiki delete blocks active subtrees", async () => {
  const parent = await createWikiPage(
    {
      contentJson: createEmptyWikiContent(),
      title: "دسته",
    },
    adminActor,
  );

  await createWikiPage(
    {
      contentJson: createEmptyWikiContent(),
      parentId: parent.id,
      title: "فرزند فعال",
    },
    adminActor,
  );

  await assert.rejects(
    () => deleteWikiPage({ pageId: parent.id }, adminActor),
    WikiValidationError,
  );
});
