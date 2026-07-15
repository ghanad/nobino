"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

type DeleteMeetingRoomButtonProps = {
  action: (formData: FormData) => void | Promise<void>;
  roomId: string;
  roomName: string;
};

export function DeleteMeetingRoomButton({
  action,
  roomId,
  roomName,
}: DeleteMeetingRoomButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    cancelButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <>
      <Button
        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
        onClick={() => setIsOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Trash2 className="h-[18px] w-[18px]" />
        حذف دائمی اتاق
      </Button>

      {isOpen ? (
        <div
          aria-labelledby="delete-meeting-room-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6"
          dir="rtl"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
          role="dialog"
        >
          <div className="w-full max-w-md rounded-xl border bg-background p-5 text-right shadow-xl">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold" id="delete-meeting-room-title">
                  حذف دائمی اتاق جلسه
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  این عملیات قابل بازگشت نیست. اتاق «{roomName}»، برنامه هفتگی،
                  استثناها و تنظیمات مرتبط با آن حذف می‌شوند. تاریخچه گذشته حفظ
                  می‌شود.
                </p>
              </div>
              <Button
                aria-label="بستن"
                onClick={() => setIsOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form action={action} className="mt-6 grid gap-4">
              <input name="roomId" type="hidden" value={roomId} />
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                برای تأیید، نام اتاق را وارد کنید: <strong>{roomName}</strong>
                <input
                  autoComplete="off"
                  className="h-11 rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  onChange={(event) => setConfirmation(event.target.value)}
                  value={confirmation}
                />
              </label>
              <div className="flex justify-start gap-2">
                <Button ref={cancelButtonRef} onClick={() => setIsOpen(false)} type="button" variant="outline">
                  انصراف
                </Button>
                <SubmitButton
                  className="bg-red-600 text-white hover:bg-red-700"
                  disabled={confirmation.trim() !== roomName}
                  pendingLabel="در حال حذف"
                >
                  حذف دائمی اتاق
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
