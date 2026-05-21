"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

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
      <p className="leading-6">{message}</p>
    </div>
  );
}
