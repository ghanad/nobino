"use client";

import { useEffect, useRef, useState } from "react";
import { Save, Undo2 } from "lucide-react";

import { DeleteMeetingRoomButton } from "@/app/admin/meeting-rooms/delete-meeting-room-button";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

type GeneralSettingsFormProps = {
  children: React.ReactNode;
  deleteAction: (formData: FormData) => void | Promise<void>;
  roomId: string;
  roomName: string;
  updateAction: (formData: FormData) => void | Promise<void>;
};

export function GeneralSettingsForm({
  children,
  deleteAction,
  roomId,
  roomName,
  updateAction,
}: GeneralSettingsFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isDirty) return;

    const warning = "تغییرات ذخیره‌نشده دارید. آیا می‌خواهید بدون ذخیره خارج شوید؟";
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    const followLink = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.href === window.location.href) return;
      if (!window.confirm(warning)) event.preventDefault();
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", followLink, true);
    };
  }, [isDirty]);

  return (
    <>
      <form
        action={updateAction}
        className="grid gap-6 p-4 pb-6 sm:p-5"
        onChange={() => setIsDirty(true)}
        onSubmit={() => setIsDirty(false)}
        ref={formRef}
      >
        <input name="roomId" type="hidden" value={roomId} />
        {children}

        <div
          aria-live="polite"
          className={cn(
            "sticky bottom-3 z-20 flex flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between",
            isDirty ? "border-blue-200" : "border-slate-200",
          )}
        >
          <p className={cn("text-sm font-medium", isDirty ? "text-slate-800" : "text-slate-500")}>
            {isDirty ? "تغییرات ذخیره‌نشده دارید" : "همه تغییرات ذخیره شده‌اند"}
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1 sm:flex-none"
              disabled={!isDirty}
              onClick={() => {
                formRef.current?.reset();
                setIsDirty(false);
              }}
              type="button"
              variant="outline"
            >
              <Undo2 className="h-[18px] w-[18px]" />
              انصراف
            </Button>
            <SubmitButton
              className="flex-1 sm:min-w-40 sm:flex-none"
              disabled={!isDirty}
              pendingLabel="در حال ذخیره"
            >
              <Save className="h-[18px] w-[18px]" />
              ذخیره تغییرات
            </SubmitButton>
          </div>
        </div>
      </form>
      <div className="border-t px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">حذف اتاق</h3>
            <p className="text-xs text-slate-600">
              با حذف اتاق، برنامه هفتگی، استثناها و تنظیمات مرتبط حذف می‌شوند.
            </p>
          </div>
          <DeleteMeetingRoomButton action={deleteAction} roomId={roomId} roomName={roomName} />
        </div>
      </div>
    </>
  );
}
