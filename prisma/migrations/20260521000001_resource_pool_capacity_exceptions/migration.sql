-- CreateTable
CREATE TABLE "ResourcePoolCapacityException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourcePoolId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "capacity" INTEGER NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResourcePoolCapacityException_resourcePoolId_fkey" FOREIGN KEY ("resourcePoolId") REFERENCES "ResourcePool" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ResourcePoolCapacityException_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ResourcePoolCapacityException_resourcePoolId_date_key" ON "ResourcePoolCapacityException"("resourcePoolId", "date");

-- CreateIndex
CREATE INDEX "ResourcePoolCapacityException_date_idx" ON "ResourcePoolCapacityException"("date");
