import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  BaleDeliveryStatus,
  LunchReservationStatus,
  SurveyAudienceMode,
  SurveyIdentityMode,
  SurveyKind,
  SurveyState,
} from "@prisma/client";

import {
  sendBaleLunchReportNow,
  syncBaleLunchReports,
} from "@/lib/bale-lunch-report-service";
import {
  BaleConnectionError,
  connectBaleChat,
  createBaleLinkToken,
  deliverPendingBaleNotifications,
  buildNotificationMessage,
  disconnectBaleAccount,
  consumeBaleUpdates,
  isBaleChatIdCommand,
  recordBaleSyncFailed,
  recordBaleSyncStarted,
  recordBaleSyncSucceeded,
} from "@/lib/bale-service";
import {
  createBaleLunchReportRecipient,
  deleteBaleLunchReportRecipient,
  updateBaleLunchReportRecipient,
} from "@/lib/admin-settings-service";
import { formatJalaliDate } from "@/lib/jalali-date";

import {
  addDays,
  createLunchReportRecipient,
  db,
  buildingId,
  lunchReportRecipientId,
  nextWorkingDateAtHour,
  registerBusinessRuleTestHooks,
  secondBuildingId,
  secondLunchReportRecipientId,
  secondUserId,
  startOfLocalDay,
  adminId,
  userId,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

function tokenFromCommand(command: string): string {
  return command.slice("/connect ".length);
}

function getBaleApiMethod(input: string | URL): string {
  return new URL(String(input)).pathname.split("/").pop() ?? "";
}

function getLunchCutoffAt(date: Date): Date {
  const cutoffAt = addDays(startOfLocalDay(date), -1);
  cutoffAt.setHours(23, 59, 0, 0);

  return cutoffAt;
}

function getLunchEligibleAt(date: Date): Date {
  return new Date(getLunchCutoffAt(date).getTime() + 60 * 1000);
}

async function withBaleMock(
  input: {
    fetchImpl: typeof fetch;
  },
  callback: () => Promise<void>,
) {
  const originalFetch = global.fetch;
  const originalToken = process.env.BALE_BOT_TOKEN;
  const originalBaseUrl = process.env.APP_BASE_URL;

  process.env.BALE_BOT_TOKEN = "test-token";
  process.env.APP_BASE_URL = "https://nobino.example";

  global.fetch = input.fetchImpl;

  try {
    await callback();
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
}

async function createDefaultLunchReportRecipient() {
  await createLunchReportRecipient();
}

test("Bale chat ID parser accepts /chatid", () => {
  assert.equal(isBaleChatIdCommand("/chatid"), true);
});

test("survey reminders use the existing Bale notification link path", () => {
  process.env.APP_BASE_URL = "https://nobino.example";
  try {
    assert.match(
      buildNotificationMessage({
        type: "SURVEY_REMINDER",
        title: "یادآوری نظرسنجی",
        body: "یادآوری",
        surveyId: "survey-id",
      }),
      /https:\/\/nobino\.example\/surveys\/survey-id/,
    );
  } finally {
    delete process.env.APP_BASE_URL;
  }
});

test("Bale chat ID parser accepts /chatid@bot_username", () => {
  assert.equal(isBaleChatIdCommand("/chatid@bot_username"), true);
});

test("Bale chat ID parser ignores surrounding whitespace", () => {
  assert.equal(isBaleChatIdCommand("  /chatid@bot_username  "), true);
});

test("Bale chat ID parser rejects lookalikes and extra arguments", () => {
  assert.equal(isBaleChatIdCommand("/chatid something"), false);
  assert.equal(isBaleChatIdCommand("text /chatid"), false);
  assert.equal(isBaleChatIdCommand("/mychatid"), false);
});

test("/chatid in private chat sends the private chat ID and does not connect", async () => {
  const sentMessages: Array<{ chatId: string; text: string }> = [];

  await withBaleMock(
    {
      fetchImpl: async (input, init) => {
        const method = getBaleApiMethod(input as string | URL);

        if (method === "getUpdates") {
          return new Response(
            JSON.stringify({
              ok: true,
              result: [
                {
                  message: {
                    chat: { id: 987654321, type: "private" },
                    text: "  /chatid  ",
                  },
                  update_id: 41,
                },
              ],
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        if (method === "sendMessage") {
          const body = new URLSearchParams(String(init?.body));
          sentMessages.push({
            chatId: body.get("chat_id") ?? "",
            text: body.get("text") ?? "",
          });

          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }

        throw new Error(`Unexpected Bale method: ${method}`);
      },
    },
    async () => {
      const result = await consumeBaleUpdates();
      assert.deepEqual(result, { connected: 0, updates: 1 });
    },
  );

  const state = await db.baleBotState.findUniqueOrThrow({
    where: { id: "default" },
  });

  assert.deepEqual(sentMessages, [
    {
      chatId: "987654321",
      text: "شناسه گفت‌وگوی خصوصی شما در بله:\n987654321",
    },
  ]);
  assert.equal(await db.baleConnection.count(), 0);
  assert.equal(await db.baleLunchReportRecipient.count(), 0);
  assert.equal(state.updateOffset, 42);
});

test("/chatid in a group does not send a reply", async () => {
  let sendMessageCalls = 0;

  await withBaleMock(
    {
      fetchImpl: async (input) => {
        const method = getBaleApiMethod(input as string | URL);

        if (method === "getUpdates") {
          return new Response(
            JSON.stringify({
              ok: true,
              result: [
                {
                  message: {
                    chat: { id: 123456789, type: "group" },
                    text: "/chatid",
                  },
                  update_id: 51,
                },
              ],
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        if (method === "sendMessage") {
          sendMessageCalls += 1;
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }

        throw new Error(`Unexpected Bale method: ${method}`);
      },
    },
    async () => {
      const result = await consumeBaleUpdates();
      assert.deepEqual(result, { connected: 0, updates: 1 });
    },
  );

  const state = await db.baleBotState.findUniqueOrThrow({
    where: { id: "default" },
  });

  assert.equal(sendMessageCalls, 0);
  assert.equal(state.updateOffset, 52);
});

test("invalid commands do not send a /chatid reply", async () => {
  let sendMessageCalls = 0;

  await withBaleMock(
    {
      fetchImpl: async (input) => {
        const method = getBaleApiMethod(input as string | URL);

        if (method === "getUpdates") {
          return new Response(
            JSON.stringify({
              ok: true,
              result: [
                {
                  message: {
                    chat: { id: 123456789, type: "private" },
                    text: "/chatid something",
                  },
                  update_id: 61,
                },
              ],
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        if (method === "sendMessage") {
          sendMessageCalls += 1;
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }

        throw new Error(`Unexpected Bale method: ${method}`);
      },
    },
    async () => {
      const result = await consumeBaleUpdates();
      assert.deepEqual(result, { connected: 0, updates: 1 });
    },
  );

  const state = await db.baleBotState.findUniqueOrThrow({
    where: { id: "default" },
  });

  assert.equal(sendMessageCalls, 0);
  assert.equal(state.updateOffset, 62);
});

test("/connect still links a private chat during update consumption", async () => {
  const link = await createBaleLinkToken(userId);
  const token = tokenFromCommand(link.command);
  const sentMessages: string[] = [];

  await withBaleMock(
    {
      fetchImpl: async (input, init) => {
        const method = getBaleApiMethod(input as string | URL);

        if (method === "getUpdates") {
          return new Response(
            JSON.stringify({
              ok: true,
              result: [
                {
                  message: {
                    chat: { id: 123456789, type: "private" },
                    text: `/connect@bot_username ${token}`,
                  },
                  update_id: 71,
                },
              ],
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        if (method === "sendMessage") {
          const body = new URLSearchParams(String(init?.body));
          sentMessages.push(body.get("text") ?? "");

          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          });
        }

        throw new Error(`Unexpected Bale method: ${method}`);
      },
    },
    async () => {
      const result = await consumeBaleUpdates();
      assert.deepEqual(result, { connected: 1, updates: 1 });
    },
  );

  const connection = await db.baleConnection.findUnique({
    where: { userId },
  });

  assert.equal(connection?.chatId, "123456789");
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0] ?? "", /موفقیت/);
});

test("manual Bale chat ID recipients accept numeric chat IDs", async () => {
  const recipient = await createBaleLunchReportRecipient({
    adminId,
    chatId: "91234567890",
    name: "گروه عملیات",
  });

  const stored = await db.baleLunchReportRecipient.findUniqueOrThrow({
    where: { id: recipient.id },
  });

  assert.equal(stored.chatId, "91234567890");
});

test("manual Bale chat ID recipients can be updated with numeric chat IDs", async () => {
  const recipient = await createBaleLunchReportRecipient({
    adminId,
    chatId: "91234567890",
    name: "گروه عملیات",
  });

  const updated = await updateBaleLunchReportRecipient({
    active: true,
    adminId,
    chatId: "91234567891",
    name: "گروه عملیات",
    recipientId: recipient.id,
  });

  assert.equal(updated.chatId, "91234567891");
});

test("admins can delete a lunch report recipient without deleting delivery history", async () => {
  const recipient = await createBaleLunchReportRecipient({
    adminId,
    chatId: "91234567890",
    name: "گروه عملیات",
  });
  const reportDate = nextWorkingDateAtHour(12);
  const delivery = await db.baleLunchReportDelivery.create({
    data: {
      chatId: recipient.chatId,
      cutoffAt: getLunchCutoffAt(reportDate),
      deliveryKey: `delete-recipient:${reportDate.toISOString()}`,
      message: "گزارش آزمایشی",
      recipientId: recipient.id,
      recipientName: recipient.name,
      reportDate,
      totalCount: 1,
    },
  });

  await deleteBaleLunchReportRecipient({
    adminId,
    recipientId: recipient.id,
  });

  assert.equal(
    await db.baleLunchReportRecipient.findUnique({ where: { id: recipient.id } }),
    null,
  );
  assert.equal(
    (await db.baleLunchReportDelivery.findUniqueOrThrow({ where: { id: delivery.id } }))
      .recipientId,
    null,
  );
  assert.ok(
    await db.auditLog.findFirst({
      where: {
        action: "BALE_LUNCH_REPORT_RECIPIENT_DELETED",
        entityId: recipient.id,
      },
    }),
  );
});

test("manual Bale chat ID recipients reject nonnumeric chat IDs", async () => {
  await assert.rejects(
    () =>
      createBaleLunchReportRecipient({
        adminId,
        chatId: "123abc",
        name: "گروه عملیات",
      }),
    /شناسه گفت‌وگوی بله معتبر نیست\./,
  );
});

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

  await connectBaleChat(tokenFromCommand(first.command), "222222222");
  await assert.rejects(
    () => connectBaleChat(tokenFromCommand(second.command), "222222222"),
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
    () => connectBaleChat(tokenFromCommand(link.command), "333333333"),
    BaleConnectionError,
  );
  assert.equal(await db.baleConnection.count({ where: { userId } }), 0);
});

test("disconnecting removes the Bale chat mapping", async () => {
  const link = await createBaleLinkToken(userId);
  await connectBaleChat(tokenFromCommand(link.command), "444444444");

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
  await connectBaleChat(tokenFromCommand(link.command), "555555555");
  const currentNotification = await db.notification.create({
    data: {
      userId,
      type: "RESERVATION_APPROVED",
      title: "Reservation approved",
      body: "Your reservation request has been approved.",
    },
  });
  const sentBodies: string[] = [];

  await withBaleMock(
    {
      fetchImpl: async (_input, init) => {
        sentBodies.push(String(init?.body));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const result = await deliverPendingBaleNotifications();
      assert.deepEqual(result, { failed: 0, sent: 1 });
    },
  );

  assert.equal(sentBodies.length, 1);
  const sentMessage = new URLSearchParams(sentBodies[0]);
  assert.equal(sentMessage.get("chat_id"), "555555555");
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

test("Bale delivery appends a validated direct Nobino link for survey invitations", async () => {
  const survey = await db.survey.create({
    data: {
      audienceMode: SurveyAudienceMode.ALL_ACTIVE,
      identityMode: SurveyIdentityMode.NAMED,
      kind: SurveyKind.SATISFACTION,
      ownerId: adminId,
      state: SurveyState.PUBLISHED,
      title: "Survey invitation",
    },
  });
  const link = await createBaleLinkToken(userId);
  await connectBaleChat(tokenFromCommand(link.command), "666666666");
  await db.notification.create({
    data: {
      body: "برای شرکت در نظرسنجی دعوت شده‌اید.",
      surveyId: survey.id,
      title: "دعوت به نظرسنجی",
      type: "SURVEY_INVITATION",
      userId,
    },
  });
  const sentBodies: string[] = [];

  await withBaleMock(
    {
      fetchImpl: async (_input, init) => {
        sentBodies.push(String(init?.body));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      assert.deepEqual(await deliverPendingBaleNotifications(), { failed: 0, sent: 1 });
    },
  );

  const text = new URLSearchParams(sentBodies[0]).get("text") ?? "";
  assert.match(text, new RegExp(`https://nobino\\.example/surveys/${survey.id}`));
});

test("lunch report does not claim or send before the eligible minute", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const sentBodies: string[] = [];
  await createDefaultLunchReportRecipient();

  await withBaleMock(
    {
      fetchImpl: async (_input, init) => {
        sentBodies.push(String(init?.body));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const result = await syncBaleLunchReports({
        now: new Date(getLunchEligibleAt(targetDate).getTime() - 1),
      });

      assert.deepEqual(result, {
        claimed: 0,
        configured: true,
        failed: 0,
        sent: 0,
        skipped: 0,
      });
    },
  );

  assert.equal(sentBodies.length, 0);
  assert.equal(await db.baleLunchReportDelivery.count(), 0);
});

test("manual lunch report sends immediately without consuming the scheduled delivery", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const manualNow = addDays(startOfLocalDay(targetDate), -1);
  const sentBodies: string[] = [];
  await createDefaultLunchReportRecipient();

  await withBaleMock(
    {
      fetchImpl: async (_input, init) => {
        sentBodies.push(String(init?.body));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const manualResult = await sendBaleLunchReportNow({ now: manualNow });
      assert.deepEqual(manualResult, {
        configured: true,
        failed: 0,
        reportDate: startOfLocalDay(targetDate),
        sent: 1,
      });

      const scheduledResult = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });
      assert.equal(scheduledResult.sent, 1);
      assert.equal(scheduledResult.claimed, 1);
    },
  );

  assert.equal(sentBodies.length, 2);
  const deliveries = await db.baleLunchReportDelivery.findMany({
    where: { recipientId: lunchReportRecipientId },
    orderBy: { createdAt: "asc" },
    select: { deliveryKey: true, status: true },
  });
  assert.equal(deliveries.length, 2);
  assert.match(deliveries[0].deliveryKey, /^manual:/);
  assert.equal(deliveries[0].status, BaleDeliveryStatus.SENT);
  assert.equal(
    deliveries[1].deliveryKey,
    `${startOfLocalDay(targetDate).toISOString()}:${lunchReportRecipientId}`,
  );
  assert.equal(deliveries[1].status, BaleDeliveryStatus.SENT);
});

test("lunch report sends one minute after cutoff with Jalali date and Persian digits", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  await createDefaultLunchReportRecipient();

  await db.lunchReservation.createMany({
    data: [
      {
        userId,
        buildingId: buildingId,
        date: startOfLocalDay(targetDate),
        breakfastReserved: true,
        status: LunchReservationStatus.ACTIVE,
      },
      {
        userId: secondUserId,
        buildingId: buildingId,
        date: startOfLocalDay(targetDate),
        status: LunchReservationStatus.CANCELLED_BY_USER,
      },
    ],
  });

  await db.building.create({
    data: {
      id: "building-c",
      name: "Building C",
      active: false,
    },
  });
  await db.lunchReservation.create({
    data: {
      userId: secondUserId,
      buildingId: "building-c",
      date: startOfLocalDay(targetDate),
      status: LunchReservationStatus.ACTIVE,
    },
  });

  const sentBodies: string[] = [];

  await withBaleMock(
    {
      fetchImpl: async (_input, init) => {
        sentBodies.push(String(init?.body));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const result = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });

      assert.deepEqual(result, {
        claimed: 1,
        configured: true,
        failed: 0,
        sent: 1,
        skipped: 0,
      });
    },
  );

  assert.equal(sentBodies.length, 1);
  const sentMessage = new URLSearchParams(sentBodies[0]);
  const text = sentMessage.get("text") ?? "";

  assert.equal(sentMessage.get("chat_id"), "123456780");
  assert.match(text, /^گزارش غذا\n/);
  assert.match(text, new RegExp(`تاریخ: ${formatJalaliDate(targetDate)}`));
  assert.match(text, /جمع صبحانه: ۱/);
  assert.match(text, /جمع ناهار: ۲/);
  assert.match(
    text,
    /Main Building:\nصبحانه: ۱\nناهار: ۱\nاسامی ناهار:\n• Normal User/,
  );
  assert.match(text, /Building B:\nصبحانه: ۰\nناهار: ۰/);
  assert.match(
    text,
    /Building C:\nصبحانه: ۰\nناهار: ۱\nاسامی ناهار:\n• Second User/,
  );
  assert.doesNotMatch(text, /اسامی صبحانه|@example\.test/);

  const delivery = await db.baleLunchReportDelivery.findFirstOrThrow({
    where: { reportDate: startOfLocalDay(targetDate), recipientId: lunchReportRecipientId },
  });
  assert.equal(delivery.totalCount, 3);
  assert.equal(delivery.status, BaleDeliveryStatus.SENT);
});

test("lunch report name lists can be configured separately for each meal", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  await createDefaultLunchReportRecipient();
  await db.lunchSettings.update({
    where: { id: "default" },
    data: {
      includeBreakfastNamesInReport: true,
      includeLunchNamesInReport: false,
    },
  });
  await db.lunchReservation.create({
    data: {
      userId,
      buildingId: buildingId,
      date: startOfLocalDay(targetDate),
      breakfastReserved: true,
      lunchReserved: true,
      status: LunchReservationStatus.ACTIVE,
    },
  });

  const sentBodies: string[] = [];
  await withBaleMock(
    {
      fetchImpl: async (_input, init) => {
        sentBodies.push(String(init?.body));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const result = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });
      assert.equal(result.sent, 1);
    },
  );

  const text = new URLSearchParams(sentBodies[0]).get("text") ?? "";
  assert.match(
    text,
    /صبحانه: ۱\nاسامی صبحانه:\n• Normal User\nناهار: ۱/,
  );
  assert.doesNotMatch(text, /اسامی ناهار/);
});

test("lunch report sends zero totals for a service day without reservations", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const sentBodies: string[] = [];
  await createDefaultLunchReportRecipient();

  await withBaleMock(
    {
      fetchImpl: async (_input, init) => {
        sentBodies.push(String(init?.body));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const result = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });

      assert.equal(result.sent, 1);
      assert.equal(result.claimed, 1);
    },
  );

  const text = new URLSearchParams(sentBodies[0]).get("text") ?? "";
  assert.match(text, /جمع صبحانه: ۰/);
  assert.match(text, /جمع ناهار: ۰/);
  assert.match(text, /Main Building:\nصبحانه: ۰\nناهار: ۰/);
  assert.match(text, /Building B:\nصبحانه: ۰\nناهار: ۰/);
});

test("lunch report skips non-service days and disabled lunch settings", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  let fetchCalls = 0;
  await createDefaultLunchReportRecipient();

  await db.lunchException.upsert({
    where: { date: startOfLocalDay(targetDate) },
    update: {
      isServiceDay: false,
      reason: "No lunch",
    },
    create: {
      date: startOfLocalDay(targetDate),
      isServiceDay: false,
      reason: "No lunch",
    },
  });

  await withBaleMock(
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const noServiceResult = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });

      assert.deepEqual(noServiceResult, {
        claimed: 1,
        configured: true,
        failed: 0,
        sent: 0,
        skipped: 1,
      });

      await db.lunchSettings.update({
        where: { id: "default" },
        data: { enabled: false },
      });
      await db.baleLunchReportDelivery.deleteMany();
      await db.baleBotState.update({
        where: { id: "default" },
        data: { lastLunchReportCheckAt: null },
      });
      await db.lunchException.deleteMany();

      const disabledResult = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });

      assert.deepEqual(disabledResult, {
        claimed: 1,
        configured: true,
        failed: 0,
        sent: 0,
        skipped: 1,
      });
    },
  );

  assert.equal(fetchCalls, 0);
  const deliveries = await db.baleLunchReportDelivery.findMany({
    orderBy: { createdAt: "asc" },
    select: { status: true },
  });
  assert.deepEqual(
    deliveries.map((delivery) => delivery.status),
    [BaleDeliveryStatus.SKIPPED],
  );
});

test("lunch report does not send or create deliveries when the chat is not configured", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  let fetchCalls = 0;

  await withBaleMock(
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const result = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });

      assert.deepEqual(result, {
        claimed: 0,
        configured: false,
        failed: 0,
        sent: 0,
        skipped: 0,
      });
    },
  );

  assert.equal(fetchCalls, 0);
  assert.equal(await db.baleLunchReportDelivery.count(), 0);
});

test("lunch report sync is idempotent for the same report date", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  let fetchCalls = 0;
  await createDefaultLunchReportRecipient();

  await withBaleMock(
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const first = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });
      const second = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });

      assert.equal(first.sent, 1);
      assert.deepEqual(second, {
        claimed: 0,
        configured: true,
        failed: 0,
        sent: 0,
        skipped: 0,
      });
    },
  );

  assert.equal(fetchCalls, 1);
  assert.equal(await db.baleLunchReportDelivery.count(), 1);
});

test("lunch report sends to all active recipients and stores one delivery per recipient", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const sentChatIds: string[] = [];

  await createLunchReportRecipient({
    chatId: "666666667",
    id: lunchReportRecipientId,
    name: "گروه عملیات",
  });
  await createLunchReportRecipient({
    chatId: "666666668",
    id: secondLunchReportRecipientId,
    name: "گروه پشتیبانی",
  });

  await withBaleMock(
    {
      fetchImpl: async (_input, init) => {
        sentChatIds.push(new URLSearchParams(String(init?.body)).get("chat_id") ?? "");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const result = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });

      assert.deepEqual(result, {
        claimed: 2,
        configured: true,
        failed: 0,
        sent: 2,
        skipped: 0,
      });
    },
  );

  assert.deepEqual(sentChatIds.sort(), [
    "666666667",
    "666666668",
  ]);
  assert.equal(
    await db.baleLunchReportDelivery.count({
      where: { reportDate: startOfLocalDay(targetDate) },
    }),
    2,
  );
});

test("lunch report resolves a user recipient's current Bale connection on retry", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const sentChatIds: string[] = [];

  await createLunchReportRecipient({
    name: "مسئول تدارکات",
    userId,
  });

  await withBaleMock(
    {
      fetchImpl: async (_input, init) => {
        sentChatIds.push(new URLSearchParams(String(init?.body)).get("chat_id") ?? "");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const failed = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });

      assert.equal(failed.failed, 1);
      const delivery = await db.baleLunchReportDelivery.findFirstOrThrow({
        where: { recipientId: lunchReportRecipientId },
      });
      assert.equal(delivery.chatId, null);
      assert.match(delivery.lastError ?? "", /اتصال فعال بله ندارد/);

      await db.baleConnection.create({
        data: {
          chatId: "777777777",
          enabled: true,
          userId,
        },
      });
      await db.baleLunchReportDelivery.update({
        where: { id: delivery.id },
        data: { updatedAt: new Date(delivery.updatedAt.getTime() - 60 * 1000) },
      });

      const retried = await syncBaleLunchReports({
        now: new Date(getLunchEligibleAt(targetDate).getTime() + 60 * 1000),
      });

      assert.equal(retried.sent, 1);
    },
  );

  assert.deepEqual(sentChatIds, ["777777777"]);
  const delivered = await db.baleLunchReportDelivery.findFirstOrThrow({
    where: { recipientId: lunchReportRecipientId },
  });
  assert.equal(delivered.chatId, "777777777");
  assert.equal(delivered.status, BaleDeliveryStatus.SENT);
});

test("lunch report failures are stored and retries send the original snapshot", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  const sentTexts: string[] = [];
  let fetchAttempt = 0;
  await createDefaultLunchReportRecipient();

  await db.lunchReservation.create({
    data: {
      userId,
      buildingId: buildingId,
      date: startOfLocalDay(targetDate),
      status: LunchReservationStatus.ACTIVE,
    },
  });

  await withBaleMock(
    {
      fetchImpl: async (_input, init) => {
        fetchAttempt += 1;

        if (fetchAttempt === 1) {
          return new Response(JSON.stringify({ ok: false, description: "temporary outage" }), {
            headers: { "Content-Type": "application/json" },
            status: 502,
          });
        }

        sentTexts.push(new URLSearchParams(String(init?.body)).get("text") ?? "");

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const failed = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });

      assert.equal(failed.failed, 1);
      assert.equal(failed.claimed, 1);

      const storedAfterFailure = await db.baleLunchReportDelivery.findFirstOrThrow({
        where: { reportDate: startOfLocalDay(targetDate), recipientId: lunchReportRecipientId },
      });

      assert.equal(storedAfterFailure.status, BaleDeliveryStatus.FAILED);
      assert.equal(storedAfterFailure.attempts, 1);
      assert.equal(storedAfterFailure.lastError, "temporary outage");

      await db.baleLunchReportDelivery.update({
        where: { id: storedAfterFailure.id },
        data: {
          updatedAt: new Date(storedAfterFailure.updatedAt.getTime() - 60 * 1000),
        },
      });

      await db.lunchReservation.create({
        data: {
          userId: secondUserId,
          buildingId: secondBuildingId,
          date: startOfLocalDay(targetDate),
          status: LunchReservationStatus.ACTIVE,
        },
      });

      const retried = await syncBaleLunchReports({
        now: new Date(getLunchEligibleAt(targetDate).getTime() + 60 * 1000),
      });

      assert.equal(retried.sent, 1);

      const storedAfterRetry = await db.baleLunchReportDelivery.findFirstOrThrow({
        where: { reportDate: startOfLocalDay(targetDate), recipientId: lunchReportRecipientId },
      });

      assert.equal(storedAfterRetry.status, BaleDeliveryStatus.SENT);
      assert.equal(storedAfterRetry.attempts, 2);
      assert.equal(sentTexts[0], storedAfterFailure.message);
      assert.match(sentTexts[0] ?? "", /جمع ناهار: ۱/);
      assert.doesNotMatch(sentTexts[0] ?? "", /جمع ناهار: ۲/);
    },
  );
});

test("lunch report stops retrying after three failed attempts", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  let fetchCalls = 0;
  await createDefaultLunchReportRecipient();

  await db.baleLunchReportDelivery.create({
    data: {
      deliveryKey: `${startOfLocalDay(targetDate).toISOString()}:${lunchReportRecipientId}`,
      recipientId: lunchReportRecipientId,
      recipientName: "گروه عملیات",
      reportDate: startOfLocalDay(targetDate),
      cutoffAt: getLunchCutoffAt(targetDate),
      chatId: "123456780",
      message: "stored snapshot",
      totalCount: 0,
      status: BaleDeliveryStatus.FAILED,
      attempts: 3,
    },
  });

  await withBaleMock(
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const result = await syncBaleLunchReports({
        now: new Date(getLunchEligibleAt(targetDate).getTime() + 60 * 1000),
      });

      assert.deepEqual(result, {
        claimed: 0,
        configured: true,
        failed: 0,
        sent: 0,
        skipped: 0,
      });
    },
  );

  assert.equal(fetchCalls, 0);
});

test("lunch report reclaims stale sending deliveries but not fresh ones", async () => {
  const targetDate = nextWorkingDateAtHour(12);
  let fetchCalls = 0;
  await createDefaultLunchReportRecipient();

  await db.baleLunchReportDelivery.create({
    data: {
      deliveryKey: `${startOfLocalDay(targetDate).toISOString()}:${lunchReportRecipientId}`,
      recipientId: lunchReportRecipientId,
      recipientName: "گروه عملیات",
      reportDate: startOfLocalDay(targetDate),
      cutoffAt: getLunchCutoffAt(targetDate),
      chatId: "123456780",
      message: "fresh snapshot",
      totalCount: 0,
      status: BaleDeliveryStatus.SENDING,
      attempts: 1,
      updatedAt: new Date(getLunchEligibleAt(targetDate).getTime() - 4 * 60 * 1000),
    },
  });

  await withBaleMock(
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
    async () => {
      const freshResult = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });

      assert.equal(freshResult.sent, 0);
      assert.equal(fetchCalls, 0);

      const currentDelivery = await db.baleLunchReportDelivery.findFirstOrThrow({
        where: { reportDate: startOfLocalDay(targetDate), recipientId: lunchReportRecipientId },
      });
      await db.baleLunchReportDelivery.update({
        where: { id: currentDelivery.id },
        data: {
          updatedAt: new Date(getLunchEligibleAt(targetDate).getTime() - 6 * 60 * 1000),
        },
      });

      const staleResult = await syncBaleLunchReports({
        now: getLunchEligibleAt(targetDate),
      });

      assert.equal(staleResult.sent, 1);
    },
  );

  const delivery = await db.baleLunchReportDelivery.findFirstOrThrow({
    where: { reportDate: startOfLocalDay(targetDate), recipientId: lunchReportRecipientId },
  });
  assert.equal(fetchCalls, 1);
  assert.equal(delivery.status, BaleDeliveryStatus.SENT);
  assert.equal(delivery.attempts, 2);
});
