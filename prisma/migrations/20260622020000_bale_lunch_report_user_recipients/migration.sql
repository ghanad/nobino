PRAGMA foreign_keys=OFF;

ALTER TABLE "BaleLunchReportDelivery" RENAME TO "BaleLunchReportDelivery_old";
ALTER TABLE "BaleLunchReportRecipient" RENAME TO "BaleLunchReportRecipient_old";

CREATE TABLE "BaleLunchReportRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "chatId" TEXT,
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BaleLunchReportRecipient_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "BaleLunchReportRecipient" (
    "id", "name", "chatId", "userId", "active", "createdAt", "updatedAt"
)
SELECT "id", "name", "chatId", NULL, "active", "createdAt", "updatedAt"
FROM "BaleLunchReportRecipient_old";

CREATE TABLE "BaleLunchReportDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryKey" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientName" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "cutoffAt" DATETIME NOT NULL,
    "chatId" TEXT,
    "message" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENDING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BaleLunchReportDelivery_recipientId_fkey"
      FOREIGN KEY ("recipientId") REFERENCES "BaleLunchReportRecipient" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "BaleLunchReportDelivery" (
    "id", "deliveryKey", "recipientId", "recipientName", "reportDate",
    "cutoffAt", "chatId", "message", "totalCount", "status", "attempts",
    "lastError", "sentAt", "createdAt", "updatedAt"
)
SELECT
    "id", "deliveryKey", "recipientId", "recipientName", "reportDate",
    "cutoffAt", "chatId", "message", "totalCount", "status", "attempts",
    "lastError", "sentAt", "createdAt", "updatedAt"
FROM "BaleLunchReportDelivery_old";

DROP TABLE "BaleLunchReportDelivery_old";
DROP TABLE "BaleLunchReportRecipient_old";

CREATE UNIQUE INDEX "BaleLunchReportRecipient_chatId_key" ON "BaleLunchReportRecipient"("chatId");
CREATE UNIQUE INDEX "BaleLunchReportRecipient_userId_key" ON "BaleLunchReportRecipient"("userId");
CREATE INDEX "BaleLunchReportRecipient_active_name_idx" ON "BaleLunchReportRecipient"("active", "name");
CREATE UNIQUE INDEX "BaleLunchReportDelivery_deliveryKey_key" ON "BaleLunchReportDelivery"("deliveryKey");
CREATE INDEX "BaleLunchReportDelivery_status_updatedAt_idx" ON "BaleLunchReportDelivery"("status", "updatedAt");
CREATE INDEX "BaleLunchReportDelivery_reportDate_recipientId_idx" ON "BaleLunchReportDelivery"("reportDate", "recipientId");

PRAGMA foreign_keys=ON;
