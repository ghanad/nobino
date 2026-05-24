-- CreateTable
CREATE TABLE "ReservationPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "dailyUserHourLimit" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- SeedDefault
INSERT INTO "ReservationPolicy" ("id", "dailyUserHourLimit", "createdAt", "updatedAt")
VALUES ('default', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
