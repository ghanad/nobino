ALTER TABLE "ReservationPolicy" ADD COLUMN "autoAcceptEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReservationPolicy" ADD COLUMN "autoAcceptDelayHours" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "Reservation" ADD COLUMN "autoAcceptAt" DATETIME;
