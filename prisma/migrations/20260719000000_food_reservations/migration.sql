ALTER TABLE "LunchReservation" ADD COLUMN "breakfastReserved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LunchReservation" ADD COLUMN "lunchReserved" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LunchReservation" ADD COLUMN "sourceReservationId" TEXT REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LunchReservation_sourceReservationId_idx" ON "LunchReservation"("sourceReservationId");
