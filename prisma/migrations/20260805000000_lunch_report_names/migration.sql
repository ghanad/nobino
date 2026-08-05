ALTER TABLE "LunchSettings" ADD COLUMN "includeBreakfastNamesInReport" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LunchSettings" ADD COLUMN "includeLunchNamesInReport" BOOLEAN NOT NULL DEFAULT true;
