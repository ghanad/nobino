-- CreateTable
CREATE TABLE "CalendarDayOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "mode" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CalendarDayOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalendarDayOverrideTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "overrideId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarDayOverrideTarget_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "CalendarDayOverride" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarDayOverride_date_key" ON "CalendarDayOverride"("date");

-- CreateIndex
CREATE INDEX "CalendarDayOverride_date_idx" ON "CalendarDayOverride"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarDayOverrideTarget_overrideId_type_targetKey_key" ON "CalendarDayOverrideTarget"("overrideId", "type", "targetKey");

-- CreateIndex
CREATE INDEX "CalendarDayOverrideTarget_type_targetKey_idx" ON "CalendarDayOverrideTarget"("type", "targetKey");
