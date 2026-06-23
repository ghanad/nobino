"use client";

import { useState } from "react";
import { Info } from "lucide-react";

type ConnectedUser = {
  email: string;
  id: string;
  name: string;
};

export function BaleLunchReportRecipientFields(props: {
  baleBotUsername?: string | null;
  chatId?: string | null;
  connectedUsers: ConnectedUser[];
  name?: string;
  showChatIdHelp?: boolean;
  userId?: string | null;
}) {
  const [destinationType, setDestinationType] = useState<"chat" | "user">(
    props.userId ? "user" : "chat",
  );
  const chatIdHelpText = props.baleBotUsername
    ? `برای دریافت شناسه، همکار باید در گفت‌وگوی خصوصی بات بله فرمان /chatid را ارسال کند (مثلاً @${props.baleBotUsername}). دریافت پاسخ ممکن است تا اجرای بعدی زمان‌بند، حدود یک دقیقه، طول بکشد.`
    : "برای دریافت شناسه، همکار باید در گفت‌وگوی خصوصی بات بله فرمان /chatid را ارسال کند. دریافت پاسخ ممکن است تا اجرای بعدی زمان‌بند، حدود یک دقیقه، طول بکشد.";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-foreground">نام گیرنده</span>
        <input
          className="h-10 rounded-md border border-input bg-background px-3 outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
          defaultValue={props.name}
          name="name"
          placeholder="مثلاً مسئول تدارکات"
          required
          type="text"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-foreground">نوع مقصد</span>
        <select
          className="h-10 rounded-md border border-input bg-background px-3 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
          name="destinationType"
          onChange={(event) => setDestinationType(event.target.value as "chat" | "user")}
          value={destinationType}
        >
          <option value="chat">گفت‌وگو یا گروه بله</option>
          <option value="user">کاربر متصل به بله</option>
        </select>
      </label>
      {destinationType === "chat" ? (
        <div
          className={`grid gap-3 md:col-span-2 ${
            props.showChatIdHelp !== false ? "lg:grid-cols-2 lg:items-end" : ""
          }`}
        >
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-foreground">شناسه گفت‌وگو</span>
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-left outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              defaultValue={props.chatId ?? ""}
              dir="ltr"
              name="chatId"
              placeholder="Chat ID"
              required
              type="text"
            />
          </label>
          {props.showChatIdHelp !== false ? (
            <div className="flex min-h-10 items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <p>{chatIdHelpText}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <label className="grid gap-2 text-sm md:col-span-2">
          <span className="font-medium text-foreground">کاربر</span>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            defaultValue={props.userId ?? ""}
            name="userId"
            required
          >
            <option disabled value="">انتخاب کاربر متصل</option>
            {props.connectedUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
