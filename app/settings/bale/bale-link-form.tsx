"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";

import {
  generateBaleLinkCodeAction,
  type BaleLinkActionState,
} from "@/app/settings/bale/actions";
import { Button } from "@/components/ui/button";

const initialState: BaleLinkActionState = {};

export function BaleLinkForm() {
  const [state, action, pending] = useActionState(
    generateBaleLinkCodeAction,
    initialState,
  );
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    if (!state.command) {
      return;
    }

    await navigator.clipboard.writeText(state.command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <div className="grid gap-4">
      <form action={action}>
        <Button disabled={pending} type="submit">
          {pending ? "در حال ساخت کد…" : "ساخت کد اتصال"}
        </Button>
      </form>

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      {state.command ? (
        <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm leading-6 text-slate-700">
            این دستور را در گفت‌وگوی خصوصی با بات بله ارسال کنید. کد فقط یک‌بار
            قابل استفاده است و پس از ۱۰ دقیقه منقضی می‌شود.
          </p>
          <div className="flex items-center gap-2" dir="ltr">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-white px-3 py-2.5 text-left text-sm">
              {state.command}
            </code>
            <Button
              aria-label="کپی دستور اتصال"
              onClick={copyCommand}
              size="icon"
              type="button"
              variant="outline"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
