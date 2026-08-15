-- CreateTable
CREATE TABLE "SurveyRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hasSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "invitedAt" DATETIME,
    "lastReminderAt" DATETIME,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyRecipient_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SurveyDraft_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "textValue" TEXT,
    "numericValue" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyAnswerOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answerId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    CONSTRAINT "SurveyAnswerOption_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "SurveyAnswer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyAnswerOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "SurveyOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "deskReservationId" TEXT,
    "surveyId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Notification_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_meetingRoomReservationId_fkey" FOREIGN KEY ("meetingRoomReservationId") REFERENCES "MeetingRoomReservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_lunchReservationId_fkey" FOREIGN KEY ("lunchReservationId") REFERENCES "LunchReservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_deskReservationId_fkey" FOREIGN KEY ("deskReservationId") REFERENCES "DeskReservation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Notification" ("body", "createdAt", "deskReservationId", "id", "lunchReservationId", "meetingRoomReservationId", "readAt", "reservationId", "title", "type", "userId") SELECT "body", "createdAt", "deskReservationId", "id", "lunchReservationId", "meetingRoomReservationId", "readAt", "reservationId", "title", "type", "userId" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_reservationId_idx" ON "Notification"("reservationId");
CREATE INDEX "Notification_meetingRoomReservationId_idx" ON "Notification"("meetingRoomReservationId");
CREATE INDEX "Notification_lunchReservationId_idx" ON "Notification"("lunchReservationId");
CREATE INDEX "Notification_deskReservationId_idx" ON "Notification"("deskReservationId");
CREATE INDEX "Notification_surveyId_idx" ON "Notification"("surveyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SurveyRecipient_userId_surveyId_idx" ON "SurveyRecipient"("userId", "surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyRecipient_surveyId_userId_key" ON "SurveyRecipient"("surveyId", "userId");

-- CreateIndex
CREATE INDEX "SurveyDraft_userId_surveyId_idx" ON "SurveyDraft"("userId", "surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyDraft_surveyId_userId_key" ON "SurveyDraft"("surveyId", "userId");

-- CreateIndex
CREATE INDEX "SurveyResponse_surveyId_submittedAt_idx" ON "SurveyResponse"("surveyId", "submittedAt");

-- CreateIndex
CREATE INDEX "SurveyResponse_userId_surveyId_idx" ON "SurveyResponse"("userId", "surveyId");

-- CreateIndex
CREATE INDEX "SurveyAnswer_questionId_idx" ON "SurveyAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyAnswer_responseId_questionId_key" ON "SurveyAnswer"("responseId", "questionId");

-- CreateIndex
CREATE INDEX "SurveyAnswerOption_optionId_idx" ON "SurveyAnswerOption"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyAnswerOption_answerId_optionId_key" ON "SurveyAnswerOption"("answerId", "optionId");
