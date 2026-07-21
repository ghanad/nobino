CREATE TABLE "Office" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Desk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Desk_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OfficeWeeklySchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isWorkingDay" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OfficeWeeklySchedule_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OfficeScheduleException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "isWorkingDay" BOOLEAN NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OfficeScheduleException_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DeskSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 14,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "DeskReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedAt" DATETIME,
    "cancelledById" TEXT,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeskReservation_deskId_fkey" FOREIGN KEY ("deskId") REFERENCES "Desk" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeskReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeskReservation_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "Notification" ADD COLUMN "deskReservationId" TEXT REFERENCES "DeskReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Office_name_key" ON "Office"("name");
CREATE INDEX "Office_active_sortOrder_name_idx" ON "Office"("active", "sortOrder", "name");
CREATE UNIQUE INDEX "Desk_officeId_name_key" ON "Desk"("officeId", "name");
CREATE INDEX "Desk_officeId_active_sortOrder_name_idx" ON "Desk"("officeId", "active", "sortOrder", "name");
CREATE UNIQUE INDEX "OfficeWeeklySchedule_officeId_dayOfWeek_key" ON "OfficeWeeklySchedule"("officeId", "dayOfWeek");
CREATE UNIQUE INDEX "OfficeScheduleException_officeId_date_key" ON "OfficeScheduleException"("officeId", "date");
CREATE INDEX "OfficeScheduleException_date_idx" ON "OfficeScheduleException"("date");
CREATE INDEX "DeskReservation_deskId_startAt_endAt_idx" ON "DeskReservation"("deskId", "startAt", "endAt");
CREATE INDEX "DeskReservation_status_startAt_idx" ON "DeskReservation"("status", "startAt");
CREATE INDEX "DeskReservation_userId_startAt_idx" ON "DeskReservation"("userId", "startAt");
CREATE INDEX "Notification_deskReservationId_idx" ON "Notification"("deskReservationId");

INSERT INTO "DeskSettings" ("id", "maxAdvanceDays", "createdAt", "updatedAt")
VALUES ('default', 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
