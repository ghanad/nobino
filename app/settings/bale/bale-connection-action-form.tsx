"use client";

import { Unplug } from "lucide-react";
import { useActionState } from "react";

import type { BaleConnectionActionState } from "@/app/settings/bale/actions";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: BaleConnectionActionState = { message: "", status: "idle" };

type BaleAction = (
  previousState: BaleConnectionActionState,
  formData: FormData,
) => Promise<BaleConnectionActionState>;

export function BaleConnectionActionForm({
  action,
  kind,
}: {
  action: BaleAction;
  kind: "check" | "disconnect";
}) {
  const [state, formAction] = useActionState(action, initialState);
  const isDisconnect = kind === "disconnect";

  return (
    <form action={formAction} className="grid justify-items-start gap-2">
      {isDisconnect ? (
        <SubmitButton pendingLabel="در حال قطع اتصال..." variant="outline">
          <Unplug className="h-4 w-4" />
          قطع اتصال
        </SubmitButton>
      ) : (
        <SubmitButton pendingLabel="در حال بررسی..." variant="secondary">
          بررسی اتصال
        </SubmitButton>
      )}
      {state.status !== "idle" ? (
        <p
          className={
            state.status === "success"
              ? "text-sm text-emerald-700"
              : "text-sm text-destructive"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
