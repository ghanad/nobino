---
version: 1
slug: "app-wiki-page-tsx"
primary_target: "app/wiki/page.tsx"
related_targets: ["app/wiki/_components/wiki-chat.tsx","app/api/wiki-ai/chat/route.ts","app/admin/wiki-ai/page.tsx"]
---

# Wiki landing assistant

- Scope and mode: authenticated `/wiki` landing page in Operate/Read mode; article, editor, history, and transfer routes retain their existing behavior and do not show chat.
- Audience and job: employees ask a Persian question about internal processes, receive a concise evidence-bound answer, and open the cited wiki pages to verify it before acting.
- Direction: extend Nobino's Quiet Service Desk with one large, flat conversation workspace beside the existing wiki tree; the memorable moment is a streamed answer resolving into first-party source links.
- Grounding and sources: rank the current and immediately preceding user queries against role-visible wiki content, send only the best-matching bounded set to the model, and treat a response without a recognized retrieved-page ID as unsupported. The server maps recognized IDs to canonical wiki slugs and titles and ignores invented IDs, so every rendered source link is application-authored rather than model-authored.
- Responsive behavior: on mobile, keep the compact empty-state explanation, horizontally scrolling suggestion prompts, and composer together in the first viewport; at larger breakpoints suggestions may wrap and the conversation workspace can grow taller. The message history scrolls independently while the composer remains at the workspace edge.
- States and interaction: expose loading, streaming, stop, incomplete/error, unsupported, empty-content, disabled, and reset states; Enter submits, Shift+Enter adds a line, focus returns to the composer after completion, and status changes are announced without exposing model reasoning.
- Administration: admins can open `/admin/wiki-ai` from the admin-only management menu in the global navigation to enable or disable the assistant, configure the allowlisted OpenAI-compatible base URL, model, timeout, and output-token limit, test the connection/model listing, and receive explicit success or failure feedback; settings changes remain audited.
- Data boundary: only wiki pages visible to the current role enter retrieval and model context; conversation stays client-session-only, and the server enforces message-size, request-count, rate, timeout, and knowledge-context bounds.
