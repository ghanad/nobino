ALTER TABLE "BaleBotState" ADD COLUMN "lastLunchReportCheckAt" DATETIME;

CREATE TABLE "BaleLunchReportDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "BaleLunchReportDelivery_reportDate_key" ON "BaleLunchReportDelivery"("reportDate");
CREATE INDEX "BaleLunchReportDelivery_status_updatedAt_idx" ON "BaleLunchReportDelivery"("status", "updatedAt");
