-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "identityMode" TEXT NOT NULL,
    "audienceMode" TEXT NOT NULL,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "publishedAt" DATETIME,
    "closedAt" DATETIME,
    "archivedAt" DATETIME,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Survey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyCollaborator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyCollaborator_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyAudienceTeam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyAudienceTeam_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyAudienceTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyAudienceUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyAudienceUser_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyAudienceUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "helpText" TEXT,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "randomizeOptions" BOOLEAN NOT NULL DEFAULT false,
    "ratingMin" INTEGER,
    "ratingMax" INTEGER,
    "ratingMinLabel" TEXT,
    "ratingMaxLabel" TEXT,
    "maxSelections" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SurveyOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SurveyQuestionCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetQuestionId" TEXT NOT NULL,
    "sourceQuestionId" TEXT NOT NULL,
    "sourceOptionId" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SurveyQuestionCondition_targetQuestionId_fkey" FOREIGN KEY ("targetQuestionId") REFERENCES "SurveyQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyQuestionCondition_sourceQuestionId_fkey" FOREIGN KEY ("sourceQuestionId") REFERENCES "SurveyQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SurveyQuestionCondition_sourceOptionId_fkey" FOREIGN KEY ("sourceOptionId") REFERENCES "SurveyOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Survey_ownerId_state_idx" ON "Survey"("ownerId", "state");
CREATE INDEX "Survey_state_startsAt_endsAt_idx" ON "Survey"("state", "startsAt", "endsAt");
CREATE UNIQUE INDEX "SurveyCollaborator_surveyId_userId_key" ON "SurveyCollaborator"("surveyId", "userId");
CREATE INDEX "SurveyCollaborator_userId_surveyId_idx" ON "SurveyCollaborator"("userId", "surveyId");
CREATE UNIQUE INDEX "SurveyAudienceTeam_surveyId_teamId_key" ON "SurveyAudienceTeam"("surveyId", "teamId");
CREATE INDEX "SurveyAudienceTeam_teamId_surveyId_idx" ON "SurveyAudienceTeam"("teamId", "surveyId");
CREATE UNIQUE INDEX "SurveyAudienceUser_surveyId_userId_key" ON "SurveyAudienceUser"("surveyId", "userId");
CREATE INDEX "SurveyAudienceUser_userId_surveyId_idx" ON "SurveyAudienceUser"("userId", "surveyId");
CREATE INDEX "SurveyQuestion_surveyId_sortOrder_idx" ON "SurveyQuestion"("surveyId", "sortOrder");
CREATE INDEX "SurveyOption_questionId_sortOrder_idx" ON "SurveyOption"("questionId", "sortOrder");
CREATE UNIQUE INDEX "SurveyQuestionCondition_targetQuestionId_key" ON "SurveyQuestionCondition"("targetQuestionId");
CREATE INDEX "SurveyQuestionCondition_sourceQuestionId_idx" ON "SurveyQuestionCondition"("sourceQuestionId");
CREATE INDEX "SurveyQuestionCondition_sourceOptionId_idx" ON "SurveyQuestionCondition"("sourceOptionId");
