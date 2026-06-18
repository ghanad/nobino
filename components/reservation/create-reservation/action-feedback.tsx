"use client";

import { CheckCircle2, X, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";

import { SwipeDismissToast } from "@/components/ui/swipe-dismiss-toast";
import type {
  ActionStateBase,
  ActionToast,
} from "@/components/reservation/create-reservation/types";
import { cn } from "@/lib/utils";

export function ReservationsActionToast({
  onDismiss,
  toast,
}: {
  onDismiss: () => void;
  toast: ActionToast | null;
}) {
  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(onDismiss, 4_500);

    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast]);

  if (!toast) {
    return null;
  }

  const Icon = toast.variant === "error" ? XCircle : CheckCircle2;

  return (
    <SwipeDismissToast
      className={cn(
        "fixed right-6 top-6 z-50 flex w-[min(420px,calc(100vw-3rem))] items-start gap-3 rounded-lg border bg-background p-4 text-sm shadow-lg",
        toast.variant === "error"
          ? "border-destructive/30 text-destructive"
          : "border-emerald-200 text-emerald-900",
      )}
      onDismiss={onDismiss}
      role="status"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 pl-8 leading-6">{toast.message}</p>
      <button
        aria-label="بستن پیام"
        className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </SwipeDismissToast>
  );
}

export function ActionResultBridge<TState extends ActionStateBase>({
  onComplete,
  state,
}: {
  onComplete: (state: TState) => void;
  state: TState;
}) {
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (state.status === "idle") {
      return;
    }

    onCompleteRef.current(state);
  }, [state]);

  return null;
}
