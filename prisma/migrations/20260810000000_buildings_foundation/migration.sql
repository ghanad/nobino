-- SQLite keeps the legacy Office/LunchLocation tables as storage artifacts so this
-- upgrade does not discard historical rows. Prisma maps Office to the Building domain model.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

ALTER TABLE "Office" ADD COLUMN "isTransitional" BOOLEAN NOT NULL DEFAULT false;

-- Resource pools had no physical-location field. This explicit, inactive-inference
-- Building is the only non-inferred backfill and must be resolved by an admin later.
INSERT OR IGNORE INTO "Office" (
  "id", "name", "active", "isTransitional", "sortOrder", "createdAt", "updatedAt"
) VALUES (
  'building-needs-assignment', 'نیازمند تعیین ساختمان', false, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- LunchLocation already represented the building selected for lunch. Reuse an
-- existing Building with the same name; otherwise preserve the legacy id as a new Building id.
INSERT INTO "Office" (
  "id", "name", "active", "isTransitional", "sortOrder", "createdAt", "updatedAt"
)
SELECT
  "id", "name", "active", false, 0, "createdAt", "updatedAt"
FROM "LunchLocation"
WHERE NOT EXISTS (
  SELECT 1 FROM "Office" WHERE "Office"."name" = "LunchLocation"."name"
);

CREATE TABLE "new_ResourcePool" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "buildingId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ResourcePool_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Office" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ResourcePool" ("id", "buildingId", "name", "capacity", "active", "createdAt", "updatedAt")
SELECT "id", 'building-needs-assignment', "name", "capacity", "active", "createdAt", "updatedAt"
FROM "ResourcePool";
DROP TABLE "ResourcePool";
ALTER TABLE "new_ResourcePool" RENAME TO "ResourcePool";
CREATE INDEX "ResourcePool_buildingId_idx" ON "ResourcePool"("buildingId");

CREATE TABLE "new_LunchReservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "sourceReservationId" TEXT,
  "date" DATETIME NOT NULL,
  "breakfastReserved" BOOLEAN NOT NULL DEFAULT false,
  "lunchReserved" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "LunchReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LunchReservation_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Office" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LunchReservation_sourceReservationId_fkey" FOREIGN KEY ("sourceReservationId") REFERENCES "Reservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LunchReservation" (
  "id", "userId", "buildingId", "sourceReservationId", "date", "breakfastReserved", "lunchReserved", "status", "cancelledAt", "createdAt", "updatedAt"
)
SELECT
  lr."id", lr."userId", b."id", lr."sourceReservationId", lr."date", lr."breakfastReserved", lr."lunchReserved", lr."status", lr."cancelledAt", lr."createdAt", lr."updatedAt"
FROM "LunchReservation" lr
JOIN "LunchLocation" ll ON ll."id" = lr."locationId"
JOIN "Office" b ON b."name" = ll."name";
DROP TABLE "LunchReservation";
ALTER TABLE "new_LunchReservation" RENAME TO "LunchReservation";
CREATE INDEX "LunchReservation_userId_date_idx" ON "LunchReservation"("userId", "date");
CREATE INDEX "LunchReservation_buildingId_date_idx" ON "LunchReservation"("buildingId", "date");
CREATE INDEX "LunchReservation_sourceReservationId_idx" ON "LunchReservation"("sourceReservationId");
CREATE INDEX "LunchReservation_status_date_idx" ON "LunchReservation"("status", "date");

UPDATE "CalendarDayOverrideTarget" SET "type" = 'BUILDING' WHERE "type" = 'OFFICE';

CREATE INDEX "Office_isTransitional_idx" ON "Office"("isTransitional");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
