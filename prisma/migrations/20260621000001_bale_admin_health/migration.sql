ALTER TABLE "BaleBotState" ADD COLUMN "lastSyncStartedAt" DATETIME;
ALTER TABLE "BaleBotState" ADD COLUMN "lastSyncSucceededAt" DATETIME;
ALTER TABLE "BaleBotState" ADD COLUMN "lastSyncFailedAt" DATETIME;
ALTER TABLE "BaleBotState" ADD COLUMN "lastSyncError" TEXT;
