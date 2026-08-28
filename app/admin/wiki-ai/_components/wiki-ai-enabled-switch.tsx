"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { updateWikiAiEnabledAction } from "@/app/admin/wiki-ai/actions";
import { SwipeDismissToast } from "@/components/ui/swipe-dismiss-toast";

export function WikiAiEnabledSwitch({
  defaultEnabled,
}: {
  defaultEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [successToast, setSuccessToast] = useState<string | null>(null);

  useEffect(() => {
    if (!successToast) return;

    const timeout = window.setTimeout(() => setSuccessToast(null), 4_500);

    return () => window.clearTimeout(timeout);
  }, [successToast]);

  function handleEnabledChange(nextEnabled: boolean) {
    if (isPending) return;

    const previousEnabled = enabled;
    setEnabled(nextEnabled);
    setError(null);
    setSuccessToast(null);

    startTransition(async () => {
      try {
        const result = await updateWikiAiEnabledAction(nextEnabled);

        if (result.status === "success") {
          setEnabled(result.enabled);
          setSuccessToast(result.message);
          return;
        }

        setEnabled(previousEnabled);
        setError(result.message);
      } catch {
        setEnabled(previousEnabled);
        setError("تغییر دستیار ذخیره نشد. دوباره تلاش کنید.");
      }
    });
  }

  return (
    <section
      aria-busy={isPending}
      aria-labelledby="wiki-ai-access-heading"
      className={`border-b border-slate-100 px-4 py-5 transition-colors sm:px-6 ${
        enabled ? "bg-blue-50/40" : "bg-slate-50/70"
      }`}
    >
      <label className="group grid w-fit max-w-full cursor-pointer gap-1.5">
        <span className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className="block text-sm font-semibold text-slate-950"
            id="wiki-ai-access-heading"
          >
            دسترسی کاربران به دستیار
          </span>
          <span className="relative inline-flex shrink-0">
            <input
              aria-describedby="wiki-ai-access-description"
              aria-label="دسترسی کاربران به دستیار دانش‌نامه"
              checked={enabled}
              className="peer sr-only"
              disabled={isPending}
              name="enabled"
              onChange={(event) => handleEnabledChange(event.target.checked)}
              role="switch"
              type="checkbox"
            />
            <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2" />
            <span className="pointer-events-none absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:-translate-x-5" />
          </span>
        </span>
        <span
          className="block max-w-3xl text-xs leading-5 text-muted-foreground"
          id="wiki-ai-access-description"
        >
          {enabled
            ? "کاربران می‌توانند در دانش‌نامه پرسش بپرسند و پاسخ دریافت کنند."
            : "دانش‌نامه در دسترس می‌ماند، اما کاربران نمی‌توانند از دستیار پرسش بپرسند."}
        </span>
        {error ? (
          <span
            aria-live="assertive"
            className="block text-xs font-medium text-red-700"
            role="alert"
          >
            {error}
          </span>
        ) : null}
      </label>
      {successToast ? (
        <SwipeDismissToast
          className="fixed right-6 top-6 z-50 flex w-[min(420px,calc(100vw-3rem))] items-start gap-3 rounded-lg border border-emerald-200 bg-background p-4 text-sm text-emerald-900 shadow-lg"
          onDismiss={() => setSuccessToast(null)}
          role="status"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 pl-8 leading-6">{successToast}</p>
          <button
            aria-label="بستن پیام"
            className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setSuccessToast(null)}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </SwipeDismissToast>
      ) : null}
    </section>
  );
}
