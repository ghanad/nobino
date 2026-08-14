"use server";

import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth";
import { AdminSettingsError } from "@/lib/admin-settings-service/shared";
import {
  testWikiAiConnection,
  updateWikiAiSettings,
} from "@/lib/wiki-ai-settings-service";

const settingsSchema = z.object({
  baseUrl: z.string().trim().min(1).max(500),
  enabled: z.boolean(),
  maxOutputTokens: z.coerce.number().int().min(100).max(8_000),
  model: z.string().trim().min(1).max(200),
  timeoutSeconds: z.coerce.number().int().min(5).max(300),
});

function parseSettingsForm(formData: FormData) {
  return settingsSchema.safeParse({
    baseUrl: formData.get("baseUrl"),
    enabled: formData.get("enabled") === "on",
    maxOutputTokens: formData.get("maxOutputTokens"),
    model: formData.get("model"),
    timeoutSeconds: formData.get("timeoutSeconds"),
  });
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
