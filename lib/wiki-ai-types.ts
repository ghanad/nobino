export type WikiChatRole = "assistant" | "user";

export type WikiChatRequestMessage = {
  content: string;
  role: WikiChatRole;
};

export type WikiChatSource = {
  slug: string;
  title: string;
};

export type WikiChatStreamEvent =
  | { type: "content"; value: string }
  | { type: "sources"; value: WikiChatSource[] }
  | { type: "unsupported" }
  | { type: "done" }
  | { type: "error"; message: string };
