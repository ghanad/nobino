import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  BaleConnectionError,
  connectBaleChat,
  createBaleLinkToken,
  deliverPendingBaleNotifications,
  disconnectBaleAccount,
  recordBaleSyncFailed,
  recordBaleSyncStarted,
  recordBaleSyncSucceeded,
} from "@/lib/bale-service";

import {
  db,
  registerBusinessRuleTestHooks,
  secondUserId,
  userId,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

function tokenFromCommand(command: string): string {
  return command.slice("/connect ".length);
}

test("Bale linking stores a token hash and binds a private chat once", async () => {
  const link = await createBaleLinkToken(userId);
  const token = tokenFromCommand(link.command);
  const storedToken = await db.baleLinkToken.findFirstOrThrow({
    where: { userId },
  });

  assert.notEqual(storedToken.tokenHash, token);
  assert.equal(
    storedToken.tokenHash,
    createHash("sha256").update(token).digest("hex"),
  );

  await connectBaleChat(token, "123456");

  const connection = await db.baleConnection.findUnique({ where: { userId } });
  assert.equal(connection?.chatId, "123456");
  await assert.rejects(
    () => connectBaleChat(token, "123456"),
    BaleConnectionError,
  );
});

test("a Bale chat cannot be linked to two Nobino users", async () => {
  const first = await createBaleLinkToken(userId);
  const second = await createBaleLinkToken(secondUserId);

  await connectBaleChat(tokenFromCommand(first.command), "shared-chat");
  await assert.rejects(
    () => connectBaleChat(tokenFromCommand(second.command), "shared-chat"),
    BaleConnectionError,
  );
});

test("expired Bale connection tokens are rejected", async () => {
  const link = await createBaleLinkToken(userId);
  await db.baleLinkToken.updateMany({
    where: { userId },
    data: { expiresAt: new Date(0) },
  });

  await assert.rejects(
    () => connectBaleChat(tokenFromCommand(link.command), "expired-chat"),
    BaleConnectionError,
  );
  assert.equal(await db.baleConnection.count({ where: { userId } }), 0);
});

test("disconnecting removes the Bale chat mapping", async () => {
  const link = await createBaleLinkToken(userId);
  await connectBaleChat(tokenFromCommand(link.command), "disconnect-chat");

  await disconnectBaleAccount(userId);

  assert.equal(
    await db.baleConnection.count({ where: { userId } }),
    0,
  );
});

test("Bale sync health records failures and clears them after recovery", async () => {
  await recordBaleSyncStarted();
  await recordBaleSyncFailed(new Error("temporary Bale failure"));

  const failedState = await db.baleBotState.findUniqueOrThrow({
    where: { id: "default" },
  });
  assert.ok(failedState.lastSyncStartedAt);
  assert.ok(failedState.lastSyncFailedAt);
  assert.equal(failedState.lastSyncError, "temporary Bale failure");

  await recordBaleSyncSucceeded();

  const recoveredState = await db.baleBotState.findUniqueOrThrow({
    where: { id: "default" },
  });
  assert.ok(recoveredState.lastSyncSucceededAt);
  assert.equal(recoveredState.lastSyncError, null);
});

test("Bale delivery sends only notifications created after linking", async () => {
  const oldNotification = await db.notification.create({
    data: {
      userId,
      type: "RESERVATION_APPROVED",
      title: "old",
      body: "old",
    },
  });
  const link = await createBaleLinkToken(userId);
  await connectBaleChat(tokenFromCommand(link.command), "delivery-chat");
  const currentNotification = await db.notification.create({
    data: {
      userId,
      type: "RESERVATION_APPROVED",
      title: "Reservation approved",
      body: "Your reservation request has been approved.",
    },
  });
  const originalFetch = global.fetch;
  const originalToken = process.env.BALE_BOT_TOKEN;
  const originalBaseUrl = process.env.APP_BASE_URL;
  const sentBodies: string[] = [];

  process.env.BALE_BOT_TOKEN = "test-token";
  process.env.APP_BASE_URL = "https://nobino.example";
  global.fetch = async (_input, init) => {
    sentBodies.push(String(init?.body));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  };

  try {
    const result = await deliverPendingBaleNotifications();
    assert.deepEqual(result, { failed: 0, sent: 1 });
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.BALE_BOT_TOKEN;
    } else {
      process.env.BALE_BOT_TOKEN = originalToken;
    }
    if (originalBaseUrl === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = originalBaseUrl;
    }
  }

  assert.equal(sentBodies.length, 1);
  const sentMessage = new URLSearchParams(sentBodies[0]);
  assert.equal(sentMessage.get("chat_id"), "delivery-chat");
  assert.equal(sentMessage.get("text"), "درخواست رزرو شما تایید شد.");
  assert.doesNotMatch(sentMessage.get("text") ?? "", /https?:\/\//);
  assert.equal(
    await db.baleNotificationDelivery.count({
      where: { notificationId: currentNotification.id },
    }),
    1,
  );
  const skippedDelivery = await db.baleNotificationDelivery.findUnique({
    where: { notificationId: oldNotification.id },
    select: { status: true },
  });
  assert.equal(skippedDelivery?.status, "SKIPPED");
  assert.equal(await db.baleNotificationDelivery.count(), 2);
});
