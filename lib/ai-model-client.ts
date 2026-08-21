import "server-only";

import { getWikiAiSettings } from "@/lib/wiki-ai-settings-service";

export async function requestAiJson(input: {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
}): Promise<unknown> {
  const settings = await getWikiAiSettings();
  if (!settings.enabled) throw new Error("سرویس هوش مصنوعی غیرفعال است.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutSeconds * 1000);
  try {
    const response = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: "POST",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        chat_template_kwargs: { enable_thinking: false },
        max_tokens: input.maxOutputTokens ?? Math.min(settings.maxOutputTokens, 3000),
        temperature: 0.1,
        model: settings.model,
        stream: false,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
      }),
    });
    if (!response.ok) throw new Error("سرویس مدل پاسخ معتبر نداد.");
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("پاسخ مدل ناقص است.");
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? content;
    return JSON.parse(fenced);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("پاسخ مدل JSON معتبر نیست.");
    if (error instanceof Error && error.name === "AbortError") throw new Error("مهلت پاسخ سرویس مدل تمام شد.");
    throw error instanceof Error ? error : new Error("اتصال به سرویس مدل برقرار نشد.");
  } finally {
    clearTimeout(timeout);
  }
}
