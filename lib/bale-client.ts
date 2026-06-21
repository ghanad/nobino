import "server-only";

import { z } from "zod";

const baleChatSchema = z.object({
  id: z.union([z.string(), z.number()]),
  type: z.string().optional(),
});

const baleUpdateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      chat: baleChatSchema,
      text: z.string().optional(),
    })
    .optional(),
});

const baleUpdatesResponseSchema = z.object({
  ok: z.literal(true),
  result: z.array(baleUpdateSchema),
});

const baleMethodResponseSchema = z.object({
  ok: z.boolean(),
  description: z.string().optional(),
});

export type BaleUpdate = z.infer<typeof baleUpdateSchema>;

export class BaleApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaleApiError";
  }
}

function getBotToken(): string {
  const token = process.env.BALE_BOT_TOKEN?.trim();

  if (!token) {
    throw new BaleApiError("BALE_BOT_TOKEN is not configured");
  }

  return token;
}

function getMethodUrl(method: string): string {
  return `https://tapi.bale.ai/bot${getBotToken()}/${method}`;
}

async function parseResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new BaleApiError(`Bale API returned HTTP ${response.status}`);
  }
}

async function requestBale(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    // Fetch errors may contain the credential-bearing request URL.
    throw new BaleApiError("Bale API request failed");
  }
}

export function getBaleBotUsername(): string | null {
  return process.env.BALE_BOT_USERNAME?.trim().replace(/^@/, "") || null;
}

export async function getBaleUpdates(offset: number): Promise<BaleUpdate[]> {
  const url = new URL(getMethodUrl("getUpdates"));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("timeout", "0");

  const response = await requestBale(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const parsed = baleUpdatesResponseSchema.safeParse(await parseResponse(response));

  if (!response.ok || !parsed.success) {
    throw new BaleApiError("Bale getUpdates request failed");
  }

  return parsed.data.result;
}

export async function sendBaleMessage(chatId: string, text: string): Promise<void> {
  const response = await requestBale(getMethodUrl("sendMessage"), {
    body: new URLSearchParams({ chat_id: chatId, text }),
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  const parsed = baleMethodResponseSchema.safeParse(await parseResponse(response));

  if (!response.ok || !parsed.success || !parsed.data.ok) {
    throw new BaleApiError(
      parsed.success
        ? parsed.data.description || "Bale sendMessage request failed"
        : "Bale sendMessage request failed",
    );
  }
}
