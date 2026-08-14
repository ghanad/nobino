import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createWikiChatStream } from "@/lib/wiki-ai-chat-service";

export const runtime = "nodejs";

const messageSchema = z.object({
  content: z.string().trim().min(1).max(2_000),
  role: z.enum(["assistant", "user"]),
});

const requestSchema = z
  .object({
    messages: z.array(messageSchema).min(1).max(12),
  })
  .refine(
    (value) =>
      value.messages.reduce(
        (total, message) => total + message.content.length,
        0,
      ) <= 8_000,
    { message: "Conversation is too long." },
  );

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "ابتدا وارد نوبینو شوید." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "درخواست معتبر نیست." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") {
    return Response.json({ error: "پیام ارسالی معتبر نیست." }, { status: 400 });
  }

  return createWikiChatStream({
    messages: parsed.data.messages,
    requestSignal: request.signal,
    user,
  });
}
