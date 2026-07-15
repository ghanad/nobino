-- CreateTable
CREATE TABLE "MeetingRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "autoApprovalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MeetingRoomWeeklySchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isWorkingDay" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MeetingRoomWeeklySchedule_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MeetingRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingRoomScheduleException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "isWorkingDay" BOOLEAN NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MeetingRoomScheduleException_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MeetingRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingRoomReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "title" TEXT,
    "rejectionReason" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "cancelledById" TEXT,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MeetingRoomReservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MeetingRoom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MeetingRoomReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MeetingRoomReservation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MeetingRoomReservation_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "reservationId" TEXT,
    "meetingRoomReservationId" TEXT,
    "lunchReservationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Notification_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_meetingRoomReservationId_fkey" FOREIGN KEY ("meetingRoomReservationId") REFERENCES "MeetingRoomReservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_lunchReservationId_fkey" FOREIGN KEY ("lunchReservationId") REFERENCES "LunchReservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Notification" ("body", "createdAt", "id", "lunchReservationId", "readAt", "reservationId", "title", "type", "userId") SELECT "body", "createdAt", "id", "lunchReservationId", "readAt", "reservationId", "title", "type", "userId" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MeetingRoom_isActive_sortOrder_name_idx" ON "MeetingRoom"("isActive", "sortOrder", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingRoomWeeklySchedule_roomId_dayOfWeek_key" ON "MeetingRoomWeeklySchedule"("roomId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "MeetingRoomWeeklySchedule_dayOfWeek_idx" ON "MeetingRoomWeeklySchedule"("dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingRoomScheduleException_roomId_date_key" ON "MeetingRoomScheduleException"("roomId", "date");

-- CreateIndex
CREATE INDEX "MeetingRoomScheduleException_date_idx" ON "MeetingRoomScheduleException"("date");

-- CreateIndex
CREATE INDEX "MeetingRoomReservation_roomId_startAt_endAt_idx" ON "MeetingRoomReservation"("roomId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "MeetingRoomReservation_status_startAt_idx" ON "MeetingRoomReservation"("status", "startAt");

-- CreateIndex
CREATE INDEX "MeetingRoomReservation_userId_startAt_idx" ON "MeetingRoomReservation"("userId", "startAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_reservationId_idx" ON "Notification"("reservationId");

-- CreateIndex
CREATE INDEX "Notification_meetingRoomReservationId_idx" ON "Notification"("meetingRoomReservationId");

-- CreateIndex
CREATE INDEX "Notification_lunchReservationId_idx" ON "Notification"("lunchReservationId");
