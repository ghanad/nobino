import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  AdminSettingsError,
  assertAdmin,
  type DbClient,
} from "@/lib/admin-settings-service/shared";

export const DEFAULT_WIKI_AI_SETTINGS = {
  baseUrl: "http://192.168.223.11:8001/v1",
  enabled: true,
  id: "default",
  maxOutputTokens: 900,
  model: "Qwen3.6",
  timeoutSeconds: 60,
} as const;

export type WikiAiSettingsValue = {
  baseUrl: string;
  enabled: boolean;
  id: string;
  maxOutputTokens: number;
  model: string;
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
  timeoutSeconds: number;
}): Omit<WikiAiSettingsValue, "id"> {
  const model = input.model.trim();

  if (!model || model.length > 200) {
    throw new AdminSettingsError("نام مدل معتبر نیست.");
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
    timeoutSeconds: input.timeoutSeconds,
  };
}

function mapSettings(
  settings: WikiAiSettingsValue | null,
): WikiAiSettingsValue {
  return settings ?? { ...DEFAULT_WIKI_AI_SETTINGS };
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

export async function testWikiAiConnection(input: {
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
}): Promise<WikiAiConnectionResult> {
  const values = validateWikiAiSettings({
    ...input,
    enabled: true,
    maxOutputTokens: DEFAULT_WIKI_AI_SETTINGS.maxOutputTokens,
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
