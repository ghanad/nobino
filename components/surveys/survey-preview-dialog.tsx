"use client";

import { useState, type ReactNode } from "react";

import { Eye, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SurveyPreviewDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" type="button" variant="outline">
        <Eye className="h-4 w-4" />
        پیش‌نمایش
      </Button>
      {open ? (
        <div
          aria-label="پیش‌نمایش نظرسنجی"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
          onMouseDown={() => setOpen(false)}
          role="dialog"
        >
          <div
            className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-lg border bg-background p-4 shadow-xl sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between gap-3 border-b pb-3">
              <h2 className="text-base font-semibold">پیش‌نمایش پاسخ‌دهنده</h2>
              <Button aria-label="بستن پیش‌نمایش" onClick={() => setOpen(false)} size="sm" type="button" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
