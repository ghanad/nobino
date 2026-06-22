CREATE TABLE "BaleLunchReportRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "BaleLunchReportRecipient_chatId_key" ON "BaleLunchReportRecipient"("chatId");
CREATE INDEX "BaleLunchReportRecipient_active_name_idx" ON "BaleLunchReportRecipient"("active", "name");

ALTER TABLE "BaleLunchReportDelivery" RENAME TO "BaleLunchReportDelivery_old";

CREATE TABLE "BaleLunchReportDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryKey" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientName" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "cutoffAt" DATETIME NOT NULL,
    "chatId" TEXT NOT NULL,
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
    "id",
    "deliveryKey",
    "recipientId",
    "recipientName",
    "reportDate",
    "cutoffAt",
    "chatId",
    "message",
    "totalCount",
    "status",
    "attempts",
    "lastError",
    "sentAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "reportDate" || ':legacy',
    NULL,
    'گیرنده قدیمی',
    "reportDate",
    "cutoffAt",
    "chatId",
    "message",
    "totalCount",
    "status",
    "attempts",
    "lastError",
    "sentAt",
    "createdAt",
    "updatedAt"
FROM "BaleLunchReportDelivery_old";

DROP TABLE "BaleLunchReportDelivery_old";

CREATE UNIQUE INDEX "BaleLunchReportDelivery_deliveryKey_key" ON "BaleLunchReportDelivery"("deliveryKey");
CREATE INDEX "BaleLunchReportDelivery_status_updatedAt_idx" ON "BaleLunchReportDelivery"("status", "updatedAt");
CREATE INDEX "BaleLunchReportDelivery_reportDate_recipientId_idx" ON "BaleLunchReportDelivery"("reportDate", "recipientId");
