-- CreateTable
CREATE TABLE "LunchSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 7,
    "cutoffTime" TEXT NOT NULL DEFAULT '23:59',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LunchLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LunchWeeklySchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayOfWeek" INTEGER NOT NULL,
    "isServiceDay" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LunchException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "isServiceDay" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LunchReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LunchReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LunchReservation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "LunchLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "reservationId" TEXT,
    "lunchReservationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Notification_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_lunchReservationId_fkey" FOREIGN KEY ("lunchReservationId") REFERENCES "LunchReservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Notification" ("body", "createdAt", "id", "readAt", "reservationId", "title", "type", "userId") SELECT "body", "createdAt", "id", "readAt", "reservationId", "title", "type", "userId" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "LunchLocation_name_key" ON "LunchLocation"("name");

-- CreateIndex
CREATE INDEX "LunchLocation_active_idx" ON "LunchLocation"("active");

-- CreateIndex
CREATE UNIQUE INDEX "LunchWeeklySchedule_dayOfWeek_key" ON "LunchWeeklySchedule"("dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "LunchException_date_key" ON "LunchException"("date");

-- CreateIndex
CREATE INDEX "LunchException_date_idx" ON "LunchException"("date");

-- CreateIndex
CREATE INDEX "LunchReservation_userId_date_idx" ON "LunchReservation"("userId", "date");

-- CreateIndex
CREATE INDEX "LunchReservation_locationId_date_idx" ON "LunchReservation"("locationId", "date");

-- CreateIndex
CREATE INDEX "LunchReservation_status_date_idx" ON "LunchReservation"("status", "date");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_reservationId_idx" ON "Notification"("reservationId");

-- CreateIndex
CREATE INDEX "Notification_lunchReservationId_idx" ON "Notification"("lunchReservationId");

-- SeedDefaults
INSERT INTO "LunchSettings" ("id", "maxAdvanceDays", "cutoffTime", "enabled", "updatedAt")
VALUES ('default', 7, '23:59', true, CURRENT_TIMESTAMP);

INSERT INTO "LunchWeeklySchedule" ("id", "dayOfWeek", "isServiceDay", "updatedAt")
VALUES
    ('lunch-weekly-0', 0, true, CURRENT_TIMESTAMP),
    ('lunch-weekly-1', 1, true, CURRENT_TIMESTAMP),
    ('lunch-weekly-2', 2, true, CURRENT_TIMESTAMP),
    ('lunch-weekly-3', 3, true, CURRENT_TIMESTAMP),
    ('lunch-weekly-4', 4, true, CURRENT_TIMESTAMP),
    ('lunch-weekly-5', 5, false, CURRENT_TIMESTAMP),
    ('lunch-weekly-6', 6, true, CURRENT_TIMESTAMP);
