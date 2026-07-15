ALTER TABLE "MeetingRoom" ADD COLUMN "deletedAt" DATETIME;

CREATE INDEX "MeetingRoom_deletedAt_idx" ON "MeetingRoom"("deletedAt");
