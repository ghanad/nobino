"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, Megaphone } from "lucide-react";
import type { AnnouncementSeverity } from "@prisma/client";

import { Button } from "@/components/ui/button";

type AnnouncementModalProps = {
  announcement: {
    id: string;
    title: string;
    body: string;
    severity: AnnouncementSeverity;
    requiresAck: boolean;
  } | null;
};

export function AnnouncementModal({ announcement }: AnnouncementModalProps) {
  const [visibleAnnouncementId, setVisibleAnnouncementId] = useState(
    announcement?.id ?? null,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setVisibleAnnouncementId(announcement?.id ?? null);
  }, [announcement?.id]);

  if (!announcement || visibleAnnouncementId !== announcement.id) {
    return null;
  }

  const isImportant = announcement.severity === "IMPORTANT";

  function recordReceipt() {
    if (!announcement) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/announcements/receipt", {
        body: JSON.stringify({
          acknowledge: announcement.requiresAck,
          announcementId: announcement.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (response.ok) {
        setVisibleAnnouncementId(null);
      }
    });
  }

  return (
    <div
      aria-labelledby="announcement-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6"
      dir="rtl"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-lg border bg-background p-5 text-right text-foreground shadow-xl">
        <div className="flex items-start gap-3">
          <span
            className={
              isImportant
                ? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700"
                : "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700"
            }
          >
            {isImportant ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <Megaphone className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-base font-semibold leading-7 text-slate-950"
              id="announcement-modal-title"
            >
              {announcement.title}
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">
              {announcement.body}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button disabled={isPending} onClick={recordReceipt} type="button">
            {announcement.requiresAck ? "متوجه شدم" : "بستن"}
          </Button>
        </div>
      </div>
    </div>
  );
}
