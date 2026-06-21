-- CreateTable
CREATE TABLE "BaleConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "linkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BaleConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BaleLinkToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BaleLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BaleBotState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "updateOffset" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BaleNotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENDING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BaleNotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BaleConnection_userId_key" ON "BaleConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BaleConnection_chatId_key" ON "BaleConnection"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "BaleLinkToken_tokenHash_key" ON "BaleLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BaleLinkToken_userId_expiresAt_idx" ON "BaleLinkToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BaleNotificationDelivery_notificationId_key" ON "BaleNotificationDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "BaleNotificationDelivery_status_updatedAt_idx" ON "BaleNotificationDelivery"("status", "updatedAt");
