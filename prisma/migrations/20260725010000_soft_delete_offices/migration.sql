ALTER TABLE "Office" ADD COLUMN "deletedAt" DATETIME;

CREATE INDEX "Office_deletedAt_idx" ON "Office"("deletedAt");
