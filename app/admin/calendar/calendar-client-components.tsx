"use client";

import { CalendarDayOverrideMode, CalendarDayTargetType } from "@prisma/client";
import { CalendarPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { CalendarOverrideForm } from "@/app/admin/calendar/calendar-override-form";

const GLOBAL_CALENDAR_TARGET_KEY = "global";

/* ── Inline creation section ─────────────────────────────────────── */

export function InlineCreationSection({
  buildings,
  rooms,
}: {
  buildings: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div>
        <button
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={() => setOpen(true)}
        >
          <CalendarPlus className="h-4 w-4" />
          تعریف روز خاص
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarPlus className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="font-semibold text-slate-950">تعریف روز خاص</h2>
      </div>
      <CalendarOverrideForm
        buildings={buildings}
        rooms={rooms}
        onCancel={() => setOpen(false)}
      />
    </section>
  );
}

/* ── Edit/delete overflow menu ───────────────────────────────────── */

type EditDeleteMenuProps = {
  buildings: { id: string; name: string }[];
  override: {
    id: string;
    mode: CalendarDayOverrideMode;
    startTime: string | null;
    endTime: string | null;
    reason: string | null;
    targets: { type: CalendarDayTargetType; targetKey: string }[];
  };
  rooms: { id: string; name: string }[];
};

export function EditDeleteMenu({
  buildings,
  override,
  rooms,
}: EditDeleteMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) {
    return (
      <div className="border-t bg-slate-50/50 p-4 sm:p-5">
        <CalendarOverrideForm
          initial={{
            endTime: override.endTime,
            lunch: override.targets.some(
              (target) =>
                target.type === CalendarDayTargetType.LUNCH &&
                target.targetKey === GLOBAL_CALENDAR_TARGET_KEY,
            ),
            mode: override.mode,
            buildingIds: override.targets
              .filter(
                (target) =>
                  target.type === CalendarDayTargetType.BUILDING &&
                  buildings.some((b) => b.id === target.targetKey),
              )
              .map((target) => target.targetKey),
            overrideId: override.id,
            reason: override.reason,
            roomIds: override.targets
              .filter(
                (target) =>
                  target.type === CalendarDayTargetType.MEETING_ROOM &&
                  rooms.some((r) => r.id === target.targetKey),
              )
              .map((target) => target.targetKey),
            startTime: override.startTime,
            systems: override.targets.some(
              (target) =>
                target.type === CalendarDayTargetType.SYSTEMS &&
                target.targetKey === GLOBAL_CALENDAR_TARGET_KEY,
            ),
          }}
          buildings={buildings}
          rooms={rooms}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute left-0 z-20 mt-1 w-36 rounded-md border bg-white py-1 shadow-lg">
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-right text-sm transition-colors hover:bg-slate-50"
              onClick={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              ویرایش
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-right text-sm text-destructive transition-colors hover:bg-red-50"
              onClick={() => {
                setMenuOpen(false);
                setConfirmingDelete(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف
            </button>
          </div>
        </>
      ) : null}

      {confirmingDelete ? (
        <DeleteConfirmDialog
          overrideId={override.id}
          onClose={() => setConfirmingDelete(false)}
        />
      ) : null}
    </div>
  );
}

/* ── Delete confirmation dialog ──────────────────────────────────── */

function DeleteConfirmDialog({
  overrideId,
  onClose,
}: {
  overrideId: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/20">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <p className="text-sm font-medium text-slate-950">
          این استثنا حذف شود؟
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          این عمل قابل بازگشت نیست.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-slate-100"
            onClick={onClose}
          >
            انصراف
          </button>
          <form
            action={async (formData) => {
              const { deleteCalendarDayOverrideAction } = await import(
                "@/app/admin/calendar/actions"
              );
              await deleteCalendarDayOverrideAction(formData);
            }}
          >
            <input name="overrideId" type="hidden" value={overrideId} />
            <button
              className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground transition-colors hover:bg-destructive/90"
              type="submit"
            >
              حذف
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}