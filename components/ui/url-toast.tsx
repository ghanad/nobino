"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

type UrlToastProps = {
  message: string;
  variant: "error" | "success";
  consumeKeys: string[];
};

export function UrlToast({ message, variant, consumeKeys }: UrlToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsVisible(false), 4_500);
    const url = new URL(window.location.href);

    for (const key of consumeKeys) {
      url.searchParams.delete(key);
    }

    window.history.replaceState(null, "", `${url.pathname}${url.search}`);

    return () => window.clearTimeout(timeout);
  }, [consumeKeys]);

  if (!isVisible) {
    return null;
  }

  const Icon = variant === "error" ? XCircle : CheckCircle2;

  return (
    <div
      className={`fixed right-6 top-6 z-50 flex w-[min(420px,calc(100vw-3rem))] items-start gap-3 rounded-lg border bg-background p-4 text-sm shadow-lg ${
        variant === "error"
          ? "border-destructive/30 text-destructive"
          : "border-emerald-200 text-emerald-900"
      }`}
      role="status"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 pl-8 leading-6">{message}</p>
      <button
        aria-label="بستن پیام"
        className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setIsVisible(false)}
        type="button"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
