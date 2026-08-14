import assert from "node:assert/strict";
import test from "node:test";

import { AdminSettingsError } from "@/lib/admin-settings-service/shared";
import {
  parseWikiAiSourceReferences,
  selectRelevantWikiDocuments,
} from "@/lib/wiki-ai-chat-service";
import {
  DEFAULT_WIKI_AI_SETTINGS,
  getWikiAiSettings,
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
    timeoutSeconds: 45,
  });

  assert.equal(updated.baseUrl, "http://192.168.223.11:8000/v1");
  assert.equal(updated.model, "Qwen3.6");
  assert.equal(updated.enabled, false);
  assert.equal(
    await db.auditLog.count({
      where: { action: "WIKI_AI_SETTINGS_UPDATED" },
    }),
    1,
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
