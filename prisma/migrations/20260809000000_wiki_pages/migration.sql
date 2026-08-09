-- CreateTable
CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "contentText" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WikiPage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WikiPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WikiPage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WikiPage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WikiPageRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wikiPageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "contentText" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WikiPageRevision_wikiPageId_fkey" FOREIGN KEY ("wikiPageId") REFERENCES "WikiPage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WikiPageRevision_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WikiPage_slug_key" ON "WikiPage"("slug");

-- CreateIndex
CREATE INDEX "WikiPage_parentId_sortOrder_title_idx" ON "WikiPage"("parentId", "sortOrder", "title");

-- CreateIndex
CREATE INDEX "WikiPage_deletedAt_idx" ON "WikiPage"("deletedAt");

-- CreateIndex
CREATE INDEX "WikiPage_isHidden_deletedAt_idx" ON "WikiPage"("isHidden", "deletedAt");

-- CreateIndex
CREATE INDEX "WikiPageRevision_wikiPageId_createdAt_idx" ON "WikiPageRevision"("wikiPageId", "createdAt");

-- CreateIndex
CREATE INDEX "WikiPageRevision_editorId_createdAt_idx" ON "WikiPageRevision"("editorId", "createdAt");
