"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  BookOpenCheck,
  Bot,
  Loader2,
  RotateCcw,
  Square,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  WikiChatRequestMessage,
  WikiChatSource,
  WikiChatStreamEvent,
} from "@/lib/wiki-ai-types";
import { getWikiPagePath } from "@/lib/wiki-route";
import { cn } from "@/lib/utils";

type ChatMessage = {
  content: string;
  id: string;
  role: "assistant" | "user";
  sources?: WikiChatSource[];
  status: "completed" | "error" | "stopped" | "streaming" | "unsupported";
};

type WikiChatProps = {
  enabled: boolean;
  hasContent: boolean;
  suggestions: string[];
};

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function getResponseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };

    if (typeof payload.error === "string") {
      return payload.error;
    }
  } catch {
    // Fall through to the generic message when the response is not JSON.
  }

  return "پاسخی از دستیار دریافت نشد. دوباره تلاش کنید.";
}

export function WikiChat({ enabled, hasContent, suggestions }: WikiChatProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusAnnouncement, setStatusAnnouncement] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canAsk = enabled && hasContent;

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages]);

  const updateAssistantMessage = (
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? updater(message) : message,
      ),
    );
  };

  const askQuestion = async (question: string) => {
    const content = question.trim();

    if (!content || !canAsk || isStreaming) {
      return;
    }

    const userMessage: ChatMessage = {
      content,
      id: createMessageId(),
      role: "user",
      status: "completed",
    };
    const assistantMessage: ChatMessage = {
      content: "",
      id: createMessageId(),
      role: "assistant",
      sources: [],
      status: "streaming",
    };
    const recentMessages: WikiChatRequestMessage[] = messages
      .filter((message) => message.content.trim())
      .slice(-10)
      .map((message) => ({ content: message.content, role: message.role }));
    const requestMessages = [
      ...recentMessages,
      { content, role: "user" as const },
    ];

    setDraft("");
    shouldAutoScrollRef.current = true;
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setIsStreaming(true);
    setStatusAnnouncement("در حال بررسی دانش‌نامه و آماده‌سازی پاسخ.");
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/wiki-ai/chat", {
        body: JSON.stringify({ messages: requestMessages }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(await getResponseError(response));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawDone = false;

      const consumeLine = (line: string) => {
        if (!line.trim()) {
          return;
        }

        const event = JSON.parse(line) as WikiChatStreamEvent;

        if (event.type === "content") {
          updateAssistantMessage(assistantMessage.id, (message) => ({
            ...message,
            content: message.content + event.value,
          }));
        } else if (event.type === "sources") {
          updateAssistantMessage(assistantMessage.id, (message) => ({
            ...message,
            sources: event.value,
          }));
        } else if (event.type === "unsupported") {
          updateAssistantMessage(assistantMessage.id, (message) => ({
            ...message,
            content: "پاسخ قابل اتکایی در دانش‌نامه پیدا نکردم.",
            sources: [],
            status: "unsupported",
          }));
        } else if (event.type === "done") {
          sawDone = true;
          updateAssistantMessage(assistantMessage.id, (message) => ({
            ...message,
            status:
              message.status === "streaming" ? "completed" : message.status,
          }));
          setStatusAnnouncement("پاسخ دستیار کامل شد.");
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          consumeLine(line);
        }
      }

      buffer += decoder.decode();
      consumeLine(buffer);

      if (!sawDone) {
        throw new Error("دریافت پاسخ پیش از کامل‌شدن متوقف شد.");
      }
    } catch (error) {
      const wasAborted = error instanceof Error && error.name === "AbortError";

      updateAssistantMessage(assistantMessage.id, (message) => ({
        ...message,
        content:
          message.content ||
          (wasAborted
            ? "دریافت پاسخ متوقف شد."
            : error instanceof Error
              ? error.message
              : "پاسخی از دستیار دریافت نشد. دوباره تلاش کنید."),
        status: wasAborted ? "stopped" : "error",
      }));
      setStatusAnnouncement(
        wasAborted
          ? "دریافت پاسخ متوقف شد."
          : "دریافت پاسخ با خطا متوقف شد.",
      );
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const question = formData.get("question");

    if (typeof question === "string") {
      void askQuestion(question);
    }
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void askQuestion(event.currentTarget.value);
    }
  };

  const resetConversation = () => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setDraft("");
    setStatusAnnouncement("گفت‌وگوی جدید آماده است.");
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <section
      aria-label="گفت‌وگو با دانش‌نامه"
      className="flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white sm:min-h-[38rem]"
    >
      <p aria-live="polite" className="sr-only" role="status">
        {statusAnnouncement}
      </p>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Bot aria-hidden="true" className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-950">
              دستیار دانش‌نامه
            </h2>
            <p className="truncate text-xs leading-5 text-muted-foreground">
              پاسخ براساس محتوای منتشرشده و همراه با منبع
            </p>
          </div>
        </div>
        {messages.length > 0 ? (
          <Button
            aria-label="شروع گفت‌وگوی جدید"
            onClick={resetConversation}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">گفت‌وگوی جدید</span>
          </Button>
        ) : null}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-5"
        onScroll={(event) => {
          const viewport = event.currentTarget;
          shouldAutoScrollRef.current =
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
        }}
        ref={messagesViewportRef}
      >
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-[12rem] w-full min-w-0 max-w-xl flex-col justify-center px-1 text-center sm:min-h-[25rem]">
            <BookOpenCheck
              aria-hidden="true"
              className="mx-auto h-8 w-8 text-slate-400"
            />
            <h3 className="mt-3 text-lg font-semibold text-slate-950 sm:mt-4">
              دربارهٔ فرآیندهای شرکت بپرسید
            </h3>
            <p className="mx-auto mt-1.5 max-w-md break-words text-sm leading-6 text-muted-foreground sm:mt-2 sm:leading-7">
              پاسخ فقط از دانش‌نامه تهیه می‌شود. برای بررسی دوباره، لینک صفحه‌های
              منبع هم زیر پاسخ نمایش داده خواهد شد.
            </p>

            {!enabled ? (
              <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                دستیار دانش‌نامه در حال حاضر توسط مدیر غیرفعال شده است.
              </p>
            ) : !hasContent ? (
              <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                هنوز محتوایی برای پرسش در دانش‌نامه وجود ندارد.
              </p>
            ) : suggestions.length > 0 ? (
              <div className="mt-4 flex flex-nowrap justify-start gap-2 overflow-x-auto pb-1 sm:mt-6 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0">
                {suggestions.map((suggestion) => (
                  <button
                    className="min-h-10 max-w-full shrink-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    key={suggestion}
                    onClick={() => void askQuestion(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto grid max-w-3xl gap-6">
            {messages.map((message) => {
              const isAssistant = message.role === "assistant";

              return (
                <article
                  className={cn(
                    "flex items-start gap-3",
                    isAssistant && "flex-row-reverse",
                  )}
                  key={message.id}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      isAssistant
                        ? "bg-slate-100 text-slate-600"
                        : "bg-primary text-primary-foreground",
                    )}
                  >
                    {isAssistant ? (
                      <Bot aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <UserRound aria-hidden="true" className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 max-w-[calc(100%-2.75rem)]">
                    <div
                      className={cn(
                        "whitespace-pre-wrap text-sm leading-7",
                        isAssistant
                          ? "text-slate-800"
                          : "rounded-xl bg-slate-100 px-4 py-2.5 text-slate-900",
                      )}
                    >
                      {message.content || (
                        <span className="inline-flex items-center gap-2 text-muted-foreground">
                          <Loader2
                            aria-hidden="true"
                            className="h-4 w-4 animate-spin"
                          />
                          در حال بررسی دانش‌نامه...
                        </span>
                      )}
                    </div>

                    {isAssistant && message.sources?.length ? (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="text-xs font-medium text-slate-600">
                          برای مطالعه و بررسی بیشتر
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {message.sources.map((source) => (
                            <Link
                              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              href={getWikiPagePath(source.slug)}
                              key={source.slug}
                            >
                              <BookOpenCheck
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                              />
                              {source.title}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {isAssistant &&
                    (message.status === "error" || message.status === "stopped") ? (
                      <p
                        className={cn(
                          "mt-3 rounded-md px-3 py-2 text-xs leading-5",
                          message.status === "error"
                            ? "bg-red-50 text-red-800"
                            : "bg-amber-50 text-amber-900",
                        )}
                      >
                        {message.status === "error"
                          ? "این پاسخ کامل نشد و نباید مبنای اقدام قرار بگیرد. دوباره تلاش کنید."
                          : "دریافت پاسخ متوقف شد؛ متن بالا ممکن است ناقص باشد."}
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form
        className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4"
        onSubmit={handleSubmit}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 focus-within:ring-2 focus-within:ring-ring">
          <textarea
            aria-label="سؤال از دانش‌نامه"
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canAsk || isStreaming}
            maxLength={2000}
            name="question"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={
              canAsk
                ? "سؤال خود را بنویسید..."
                : "پرسش از دانش‌نامه در دسترس نیست"
            }
            ref={textareaRef}
            required
            rows={1}
            value={draft}
          />
          {isStreaming ? (
            <Button
              aria-label="توقف دریافت پاسخ"
              className="shrink-0"
              onClick={() => abortControllerRef.current?.abort()}
              size="icon"
              type="button"
              variant="outline"
            >
              <Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              aria-label="ارسال سؤال"
              className="shrink-0"
              disabled={!canAsk}
              size="icon"
              type="submit"
            >
              <ArrowUp aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs leading-5 text-muted-foreground">
          پاسخ‌ها ممکن است خطا داشته باشند؛ منبع را پیش از اقدام بررسی کنید.
        </p>
      </form>
    </section>
  );
}
