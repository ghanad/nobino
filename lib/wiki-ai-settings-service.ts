import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  AdminSettingsError,
  assertAdmin,
  type DbClient,
} from "@/lib/admin-settings-service/shared";

export const DEFAULT_WIKI_AI_SYSTEM_PROMPT = [
  "نقش شما فقط پیدا کردن یا بازگویی سند نیست؛ باید کاربر را برای انجام کارش راهنمایی کنی.",
  "لحن را با موقعیت کاربر هماهنگ کن: اگر کاربر مسئله، نگرانی یا وضعیت شخصی مطرح کرده، با یک جمله کوتاه، طبیعی و غیرکلیشه‌ای همراهی کن، اما احساس یا شدت شرایط او را حدس نزن؛ برای پرسش‌های خنثی همدلی مصنوعی اضافه نکن.",
  "بعد، پاسخ مستقیم و اقدام بعدی را بگو. اگر پاسخ شامل یک فرایند است، آن را به ۲ تا ۵ گام کوتاه و عملی تبدیل کن و مسئول، مسیر ثبت، شرط یا زمان مهم را فقط وقتی در سند آمده حفظ کن.",
  "با فارسی گفتاریِ محترمانه بنویس؛ تا وقتی اصطلاح رسمی سازمان نیست، به‌جای عبارت‌های اداری مثل «می‌باشد»، «نمایید» و «گردد» از فعل‌های ساده و طبیعی استفاده کن.",
  "متن سند را عیناً یا به‌صورت طولانی بازگو نکن و پاسخ را با عبارت‌هایی مثل «طبق مستند» یا معرفی نام صفحه شروع نکن؛ منبع‌ها جداگانه در رابط نمایش داده می‌شوند.",
  "اگر اطلاعاتی که بین چند مسیر مستند تعیین‌کننده است در پرسش وجود ندارد، فقط یک سؤال روشن بپرس و در صورت امکان تا قبل از پاسخ کاربر، بخش مشترک و امن راهنما را هم بگو.",
  "هرگز وانمود نکن کاری را برای کاربر انجام داده‌ای یا قول پیگیری خارج از این گفت‌وگو نده.",
  "پاسخ را روشن، کوتاه و به فارسی روان بنویس. از جدول، عنوان‌های طولانی و مقدمه‌چینی استفاده نکن.",
].join("\n");

export const DEFAULT_WIKI_AI_SETTINGS = {
  baseUrl: "http://192.168.223.11:8001/v1",
  enabled: true,
  id: "default",
  maxOutputTokens: 900,
  model: "Qwen3.6",
  systemPrompt: DEFAULT_WIKI_AI_SYSTEM_PROMPT,
  timeoutSeconds: 60,
} as const;

export type WikiAiSettingsValue = {
  baseUrl: string;
  enabled: boolean;
  id: string;
  maxOutputTokens: number;
  model: string;
  systemPrompt: string;
  timeoutSeconds: number;
};

export type WikiAiConnectionResult = {
  availableModels: string[];
  latencyMs: number;
  selectedModelAvailable: boolean;
};

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new AdminSettingsError("نشانی سرویس مدل معتبر نیست.");
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new AdminSettingsError("نشانی سرویس مدل باید با http یا https شروع شود.");
  }

  if (
    url.hostname === "169.254.169.254" ||
    url.hostname === "metadata.google.internal" ||
    url.hostname === "localhost" ||
    url.hostname.startsWith("127.") ||
    url.hostname.startsWith("169.254.") ||
    url.hostname === "0.0.0.0" ||
    url.hostname === "::1" ||
    url.hostname === "[::1]"
  ) {
    throw new AdminSettingsError("این نشانی برای سرویس مدل مجاز نیست.");
  }

  const allowedHosts = new Set(
    (process.env.WIKI_AI_ALLOWED_HOSTS ?? "192.168.223.11")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new AdminSettingsError(
      "میزبان سرویس مدل در فهرست WIKI_AI_ALLOWED_HOSTS مجاز نشده است.",
    );
  }

  if (trimmed.length > 500) {
    throw new AdminSettingsError("نشانی سرویس مدل بیش از حد طولانی است.");
  }

  return trimmed;
}

function validateWikiAiSettings(input: {
  baseUrl: string;
  enabled: boolean;
  maxOutputTokens: number;
  model: string;
  systemPrompt?: string;
  timeoutSeconds: number;
}): Omit<WikiAiSettingsValue, "id"> {
  const model = input.model.trim();
  const systemPrompt = (
    input.systemPrompt ?? DEFAULT_WIKI_AI_SYSTEM_PROMPT
  ).trim();

  if (!model || model.length > 200) {
    throw new AdminSettingsError("نام مدل معتبر نیست.");
  }

  if (!systemPrompt || systemPrompt.length > 12_000) {
    throw new AdminSettingsError(
      "دستورهای رفتاری دستیار باید بین ۱ تا ۱۲۰۰۰ نویسه باشد.",
    );
  }

  if (
    !Number.isInteger(input.timeoutSeconds) ||
    input.timeoutSeconds < 5 ||
    input.timeoutSeconds > 300
  ) {
    throw new AdminSettingsError("مهلت پاسخ باید بین ۵ تا ۳۰۰ ثانیه باشد.");
  }

  if (
    !Number.isInteger(input.maxOutputTokens) ||
    input.maxOutputTokens < 100 ||
    input.maxOutputTokens > 8000
  ) {
    throw new AdminSettingsError("حداکثر توکن پاسخ باید بین ۱۰۰ تا ۸۰۰۰ باشد.");
  }

  return {
    baseUrl: normalizeBaseUrl(input.baseUrl),
    enabled: input.enabled,
    maxOutputTokens: input.maxOutputTokens,
    model,
    systemPrompt,
    timeoutSeconds: input.timeoutSeconds,
  };
}

function mapSettings(
  settings: WikiAiSettingsValue | null,
): WikiAiSettingsValue {
  if (!settings) {
    return { ...DEFAULT_WIKI_AI_SETTINGS };
  }

  return {
    ...settings,
    systemPrompt:
      settings.systemPrompt.trim() || DEFAULT_WIKI_AI_SYSTEM_PROMPT,
  };
}

export async function getWikiAiSettings(
  client: DbClient = db,
): Promise<WikiAiSettingsValue> {
  return mapSettings(
    await client.wikiAiSettings.findUnique({
      where: { id: DEFAULT_WIKI_AI_SETTINGS.id },
      select: {
        baseUrl: true,
        enabled: true,
        id: true,
        maxOutputTokens: true,
        model: true,
        systemPrompt: true,
        timeoutSeconds: true,
      },
    }),
  );
}

export async function updateWikiAiSettings(input: {
  adminId: string;
  baseUrl: string;
  enabled: boolean;
  maxOutputTokens: number;
  model: string;
  systemPrompt?: string;
  timeoutSeconds: number;
}): Promise<WikiAiSettingsValue> {
  const values = validateWikiAiSettings(input);

  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const current = await getWikiAiSettings(tx);
    const updated = await tx.wikiAiSettings.upsert({
      where: { id: DEFAULT_WIKI_AI_SETTINGS.id },
      update: values,
      create: { id: DEFAULT_WIKI_AI_SETTINGS.id, ...values },
      select: {
        baseUrl: true,
        enabled: true,
        id: true,
        maxOutputTokens: true,
        model: true,
        systemPrompt: true,
        timeoutSeconds: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "WIKI_AI_SETTINGS_UPDATED",
        actorUserId: input.adminId,
        entityId: updated.id,
        entityType: "WikiAiSettings",
        newValue: updated as unknown as Prisma.JsonObject,
        oldValue: current as unknown as Prisma.JsonObject,
      },
    });

    return updated;
  });
}

export async function setWikiAiEnabled(input: {
  adminId: string;
  enabled: boolean;
}): Promise<WikiAiSettingsValue> {
  return db.$transaction(async (tx) => {
    await assertAdmin(input.adminId, tx);
    const current = await getWikiAiSettings(tx);
    const updated = await tx.wikiAiSettings.upsert({
      where: { id: DEFAULT_WIKI_AI_SETTINGS.id },
      update: { enabled: input.enabled },
      create: {
        ...DEFAULT_WIKI_AI_SETTINGS,
        enabled: input.enabled,
      },
      select: {
        baseUrl: true,
        enabled: true,
        id: true,
        maxOutputTokens: true,
        model: true,
        systemPrompt: true,
        timeoutSeconds: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "WIKI_AI_SETTINGS_UPDATED",
        actorUserId: input.adminId,
        entityId: updated.id,
        entityType: "WikiAiSettings",
        newValue: updated as unknown as Prisma.JsonObject,
        oldValue: current as unknown as Prisma.JsonObject,
      },
    });

    return updated;
  });
}

export async function resetWikiAiSystemPrompt(
  adminId: string,
): Promise<WikiAiSettingsValue> {
  const current = await getWikiAiSettings();

  return updateWikiAiSettings({
    adminId,
    baseUrl: current.baseUrl,
    enabled: current.enabled,
    maxOutputTokens: current.maxOutputTokens,
    model: current.model,
    systemPrompt: DEFAULT_WIKI_AI_SYSTEM_PROMPT,
    timeoutSeconds: current.timeoutSeconds,
  });
}

export async function testWikiAiConnection(input: {
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
}): Promise<WikiAiConnectionResult> {
  const values = validateWikiAiSettings({
    ...input,
    enabled: true,
    maxOutputTokens: DEFAULT_WIKI_AI_SETTINGS.maxOutputTokens,
    systemPrompt: DEFAULT_WIKI_AI_SYSTEM_PROMPT,
  });
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    values.timeoutSeconds * 1000,
  );
  const startedAt = Date.now();

  try {
    const response = await fetch(`${values.baseUrl}/models`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AdminSettingsError(
        `سرویس مدل با وضعیت ${response.status} پاسخ داد.`,
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: unknown }>;
    };
    const availableModels = (payload.data ?? [])
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string");

    if (availableModels.length === 0) {
      throw new AdminSettingsError("سرویس مدل فهرست معتبری از مدل‌ها برنگرداند.");
    }

    return {
      availableModels,
      latencyMs: Date.now() - startedAt,
      selectedModelAvailable: availableModels.includes(values.model),
    };
  } catch (error) {
    if (error instanceof AdminSettingsError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AdminSettingsError("مهلت آزمایش اتصال به سرویس مدل تمام شد.");
    }

    throw new AdminSettingsError("اتصال به سرویس مدل برقرار نشد.");
  } finally {
    clearTimeout(timeout);
  }
}
