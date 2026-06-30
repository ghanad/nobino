ALTER TABLE "MeetingRoom" ADD COLUMN "autoApprovalDelayHours" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "MeetingRoomReservation" ADD COLUMN "autoApprovalAt" DATETIME;
