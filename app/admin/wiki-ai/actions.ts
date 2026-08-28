"use server";

import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { AdminSettingsError } from "@/lib/admin-settings-service/shared";
import {
  resetWikiAiSystemPrompt,
  setWikiAiEnabled,
  testWikiAiConnection,
  updateWikiAiSettings,
} from "@/lib/wiki-ai-settings-service";

const settingsSchema = z.object({
  baseUrl: z.string().trim().min(1).max(500),
  enabled: z.boolean(),
  maxOutputTokens: z.coerce.number().int().min(100).max(8_000),
  model: z.string().trim().min(1).max(200),
  systemPrompt: z.string().trim().min(1).max(12_000),
  timeoutSeconds: z.coerce.number().int().min(5).max(300),
});

const enabledSchema = z.boolean();

export type WikiAiEnabledActionState =
  | { enabled: boolean; message: string; status: "success" }
  | { message: string; status: "error" };

function parseSettingsForm(formData: FormData) {
  return settingsSchema.safeParse({
    baseUrl: formData.get("baseUrl"),
    enabled: formData.get("enabled") === "on",
    maxOutputTokens: formData.get("maxOutputTokens"),
    model: formData.get("model"),
    systemPrompt: formData.get("systemPrompt"),
    timeoutSeconds: formData.get("timeoutSeconds"),
  });
}

export async function resetWikiAiSystemPromptAction(): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);

  try {
    await resetWikiAiSystemPrompt(admin.id);
  } catch (error) {
    redirectToSettings({ error: getErrorMessage(error) });
  }

  redirectToSettings({ reset: "1" });
}

function redirectToSettings(
  params: Record<string, string | undefined>,
): never {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  redirect(query ? `/admin/wiki-ai?${query}` : "/admin/wiki-ai");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof AdminSettingsError) {
    return error.message;
  }

  throw error;
}

export async function updateWikiAiSettingsAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = parseSettingsForm(formData);

  if (!parsed.success) {
    redirectToSettings({ error: "تنظیمات دستیار دانش‌نامه معتبر نیست." });
  }

  try {
    await updateWikiAiSettings({ adminId: admin.id, ...parsed.data });
  } catch (error) {
    redirectToSettings({ error: getErrorMessage(error) });
  }

  redirectToSettings({ updated: "1" });
}

export async function updateWikiAiEnabledAction(
  enabled: unknown,
): Promise<WikiAiEnabledActionState> {
  const admin = await requireRole([UserRole.ADMIN]);
  const parsed = enabledSchema.safeParse(enabled);

  if (!parsed.success) {
    return {
      message: "وضعیت دستیار دانش‌نامه معتبر نیست.",
      status: "error",
    };
  }

  try {
    const settings = await setWikiAiEnabled({
      adminId: admin.id,
      enabled: parsed.data,
    });

    return {
      enabled: settings.enabled,
      message: settings.enabled
        ? "دستیار برای کاربران فعال شد."
        : "دستیار برای کاربران غیرفعال شد.",
      status: "success",
    };
  } catch (error) {
    return {
      message: getErrorMessage(error),
      status: "error",
    };
  }
}

export async function testWikiAiConnectionAction(
  formData: FormData,
): Promise<void> {
  await requireRole([UserRole.ADMIN]);
  const parsed = parseSettingsForm(formData);

  if (!parsed.success) {
    redirectToSettings({ error: "نشانی، نام مدل یا مهلت اتصال معتبر نیست." });
  }

  let result;

  try {
    result = await testWikiAiConnection(parsed.data);
  } catch (error) {
    redirectToSettings({ error: getErrorMessage(error) });
  }

  redirectToSettings({
    latency: String(result.latencyMs),
    modelMissing: result.selectedModelAvailable ? undefined : "1",
    tested: "1",
  });
}
