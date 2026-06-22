"use client";

import { useState } from "react";

type ConnectedUser = {
  email: string;
  id: string;
  name: string;
};

export function BaleLunchReportRecipientFields(props: {
  chatId?: string | null;
  connectedUsers: ConnectedUser[];
  name?: string;
  userId?: string | null;
}) {
  const [destinationType, setDestinationType] = useState<"chat" | "user">(
    props.userId ? "user" : "chat",
  );

  return (
    <>
      <label className="grid gap-2 text-sm">
        <span>نام گیرنده</span>
        <input
          className="h-10 rounded-md border border-input bg-background px-3"
          defaultValue={props.name}
          name="name"
          placeholder="مثلاً مسئول تدارکات"
          required
          type="text"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span>نوع مقصد</span>
        <select
          className="h-10 rounded-md border border-input bg-background px-3"
          name="destinationType"
          onChange={(event) => setDestinationType(event.target.value as "chat" | "user")}
          value={destinationType}
        >
          <option value="chat">گفت‌وگو یا گروه بله</option>
          <option value="user">کاربر متصل به بله</option>
        </select>
      </label>
      {destinationType === "chat" ? (
        <label className="grid gap-2 text-sm">
          <span>شناسه گفت‌وگو</span>
          <input
            className="h-10 rounded-md border border-input bg-background px-3"
            defaultValue={props.chatId ?? ""}
            dir="ltr"
            name="chatId"
            placeholder="chat id"
            required
            type="text"
          />
        </label>
      ) : (
        <label className="grid gap-2 text-sm">
          <span>کاربر</span>
          <select
            className="h-10 rounded-md border border-input bg-background px-3"
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
    </>
  );
}
