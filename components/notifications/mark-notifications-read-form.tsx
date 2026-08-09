"use client";

import { Check, CheckCheck } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import {
  markNotificationsReadAction,
  type MarkNotificationsReadActionState,
} from "@/app/notifications/actions";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: MarkNotificationsReadActionState = { message: "", status: "idle" };

export function MarkNotificationsReadForm({
  notificationId,
  mode,
}: {
  mode: "all" | "single";
  notificationId?: string;
}) {
  const [state, action] = useActionState(markNotificationsReadAction, initialState);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (state.status === "success") setComplete(true);
  }, [state.status]);

  if (complete && mode === "single") {
    return <p className="text-xs text-emerald-700">خوانده شد.</p>;
  }

  return (
    <form action={action}>
      <input name="mode" type="hidden" value={mode} />
      {notificationId ? <input name="notificationId" type="hidden" value={notificationId} /> : null}
      <SubmitButton size="sm" variant={mode === "all" ? "outline" : "ghost"}>
        {mode === "all" ? <CheckCheck className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        {mode === "all" ? "همه را خواندم" : "خواندم"}
      </SubmitButton>
      {state.status === "error" ? <p className="mt-2 text-xs text-destructive" role="alert">{state.message}</p> : null}
    </form>
  );
}
