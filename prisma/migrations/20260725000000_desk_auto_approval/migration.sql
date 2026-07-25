ALTER TABLE "DeskSettings" ADD COLUMN "autoApprovalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeskSettings" ADD COLUMN "autoApprovalDelayHours" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "DeskReservation" ADD COLUMN "autoApprovalAt" DATETIME;
