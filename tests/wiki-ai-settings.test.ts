import assert from "node:assert/strict";
import test from "node:test";

import { AdminSettingsError } from "@/lib/admin-settings-service/shared";
import {
  buildWikiAssistantSystemPrompt,
  getCasualWikiAssistantResponse,
  parseWikiAiSourceReferences,
  selectRelevantWikiDocuments,
} from "@/lib/wiki-ai-chat-service";
import {
  DEFAULT_WIKI_AI_SETTINGS,
  DEFAULT_WIKI_AI_SYSTEM_PROMPT,
  getWikiAiSettings,
  resetWikiAiSystemPrompt,
  setWikiAiEnabled,
  updateWikiAiSettings,
} from "@/lib/wiki-ai-settings-service";

import {
  adminId,
  db,
  managerId,
  registerBusinessRuleTestHooks,
} from "./business-rules-helpers";

registerBusinessRuleTestHooks();

test("wiki AI settings use the internal Qwen connection by default", async () => {
  const settings = await getWikiAiSettings(db);

  assert.deepEqual(settings, DEFAULT_WIKI_AI_SETTINGS);
});

test("only admins can change wiki AI settings and changes are audited", async () => {
  await assert.rejects(
    () =>
      updateWikiAiSettings({
        adminId: managerId,
        baseUrl: "http://192.168.223.11:8000/v1",
        enabled: true,
        maxOutputTokens: 700,
        model: "Qwen3.6",
        timeoutSeconds: 45,
      }),
    AdminSettingsError,
  );

  const updated = await updateWikiAiSettings({
    adminId,
    baseUrl: "http://192.168.223.11:8000/v1/",
    enabled: false,
    maxOutputTokens: 700,
    model: " Qwen3.6 ",
    systemPrompt: "پاسخ را دوستانه و کوتاه بنویس.",
    timeoutSeconds: 45,
  });

  assert.equal(updated.baseUrl, "http://192.168.223.11:8000/v1");
  assert.equal(updated.model, "Qwen3.6");
  assert.equal(updated.enabled, false);
  assert.equal(updated.systemPrompt, "پاسخ را دوستانه و کوتاه بنویس.");
  assert.equal(
    await db.auditLog.count({
      where: { action: "WIKI_AI_SETTINGS_UPDATED" },
    }),
    1,
  );
});

test("admins can change wiki AI availability without overwriting model settings", async () => {
  await assert.rejects(
    () => setWikiAiEnabled({ adminId: managerId, enabled: false }),
    AdminSettingsError,
  );

  const updated = await setWikiAiEnabled({ adminId, enabled: false });

  assert.equal(updated.enabled, false);
  assert.equal(updated.baseUrl, DEFAULT_WIKI_AI_SETTINGS.baseUrl);
  assert.equal(updated.model, DEFAULT_WIKI_AI_SETTINGS.model);
  assert.equal(
    await db.auditLog.count({
      where: { action: "WIKI_AI_SETTINGS_UPDATED" },
    }),
    1,
  );
});

test("admins can restore the default wiki AI prompt", async () => {
  await updateWikiAiSettings({
    adminId,
    baseUrl: DEFAULT_WIKI_AI_SETTINGS.baseUrl,
    enabled: true,
    maxOutputTokens: 900,
    model: "Qwen3.6",
    systemPrompt: "فقط یک جمله پاسخ بده.",
    timeoutSeconds: 60,
  });

  const reset = await resetWikiAiSystemPrompt(adminId);

  assert.equal(reset.systemPrompt, DEFAULT_WIKI_AI_SYSTEM_PROMPT);
  assert.equal(
    await db.auditLog.count({
      where: { action: "WIKI_AI_SETTINGS_UPDATED" },
    }),
    2,
  );
});

test("wiki AI settings reject unsafe or invalid values", async () => {
  await assert.rejects(
    () =>
      updateWikiAiSettings({
        adminId,
        baseUrl: "file:///tmp/model",
        enabled: true,
        maxOutputTokens: 900,
        model: "Qwen3.6",
        timeoutSeconds: 60,
      }),
    AdminSettingsError,
  );

  await assert.rejects(
    () =>
      updateWikiAiSettings({
        adminId,
        baseUrl: "http://192.168.223.11:8000/v1",
        enabled: true,
        maxOutputTokens: 99,
        model: "Qwen3.6",
        timeoutSeconds: 60,
      }),
    AdminSettingsError,
  );
});

test("wiki AI citations accept known page IDs and ignore invented sources", () => {
  const sources = parseWikiAiSourceReferences(
    "پاسخ آزمایشی\n<sources>s2,unknown,s1</sources>",
    [
      { contentText: "الف", id: "s1", slug: "page-one", title: "صفحه اول" },
      { contentText: "ب", id: "s2", slug: "page-two", title: "صفحه دوم" },
    ],
  );

  assert.deepEqual(sources, [
    { slug: "page-one", title: "صفحه اول" },
    { slug: "page-two", title: "صفحه دوم" },
  ]);
});

test("wiki AI prompt guides users instead of merely repeating documents", () => {
  const prompt = buildWikiAssistantSystemPrompt([
    {
      contentText: "درخواست باید در سامانه منابع انسانی ثبت شود.",
      id: "s1",
      slug: "sick-leave",
      title: "مرخصی استعلاجی",
    },
  ]);

  assert.match(prompt, /کاربر را برای انجام کارش راهنمایی کنی/);
  assert.match(prompt, /اقدام بعدی/);
  assert.match(prompt, /۲ تا ۵ گام کوتاه و عملی/);
  assert.match(prompt, /یک سؤال روشن بپرس/);
  assert.match(prompt, /«می‌باشد»، «نمایید» و «گردد»/);
  assert.match(prompt, /فقط با اتکا به سندهای زیر/);
  assert.match(prompt, /درخواست باید در سامانه منابع انسانی ثبت شود/);
});

test("wiki AI prompt includes admin instructions without weakening fixed rules", () => {
  const prompt = buildWikiAssistantSystemPrompt([], "پاسخ را خیلی کوتاه بنویس.");

  assert.match(prompt, /<assistant-instructions>/);
  assert.match(prompt, /پاسخ را خیلی کوتاه بنویس/);
  assert.match(prompt, /فقط با اتکا به سندهای زیر/);
  assert.match(prompt, /<sources>s1,s2<\/sources>/);
});

test("wiki AI handles greetings without requiring a wiki source", () => {
  assert.equal(
    getCasualWikiAssistantResponse("سلام"),
    "سلام! خوشحالم که اینجام. دربارهٔ فرایندهای شرکت هر سؤالی دارید بپرسید تا راهنمایی‌تان کنم.",
  );
  assert.equal(
    getCasualWikiAssistantResponse("سلام، وقت بخیر!"),
    "سلام! خوشحالم که اینجام. دربارهٔ فرایندهای شرکت هر سؤالی دارید بپرسید تا راهنمایی‌تان کنم.",
  );
  assert.equal(
    getCasualWikiAssistantResponse("سلام، برای استعلاجی چه کار کنم؟"),
    null,
  );
});

test("wiki AI responds naturally to thanks and farewells", () => {
  assert.equal(
    getCasualWikiAssistantResponse("خیلی ممنون"),
    "خواهش می‌کنم! اگر سؤال دیگری دارید، بپرسید.",
  );
  assert.equal(
    getCasualWikiAssistantResponse("خداحافظ"),
    "خداحافظ! هر وقت سؤالی داشتید، من اینجا هستم.",
  );
});

test("wiki AI retrieval ranks relevant visible pages independent of tree order", () => {
  const documents = [
    {
      contentText: "این صفحه درباره بیمه درمانی است.",
      id: "s1",
      slug: "insurance",
      title: "بیمه تکمیلی",
    },
    {
      contentText: "برای دریافت وام باید درخواست خود را در سامانه ثبت کنید.",
      id: "s2",
      slug: "loan",
      title: "وام",
    },
  ];

  const selected = selectRelevantWikiDocuments(documents, [
    { content: "برای دریافت وام چه کاری باید انجام دهم؟", role: "user" },
  ]);

  assert.equal(selected[0]?.slug, "loan");
  assert.equal(selected.some((document) => document.slug === "insurance"), false);
});
