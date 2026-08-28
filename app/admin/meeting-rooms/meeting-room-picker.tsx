"use client";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type MeetingRoomPickerProps = {
  rooms: Array<{
    id: string;
    isActive: boolean;
    location: string | null;
    name: string;
  }>;
  selectedRoomId?: string;
  view: "details" | "schedule" | "exceptions";
};

export function MeetingRoomPicker({
  rooms,
  selectedRoomId,
  view,
}: MeetingRoomPickerProps) {
  return (
    <form
      action="/admin/meeting-rooms"
      className="w-full max-w-[240px]"
    >
      <input name="view" type="hidden" value={view} />
      <label className="sr-only" htmlFor="roomId">
        اتاق موردنظر
      </label>
      <div className="relative">
        <select
          className={cn(
            "h-9 w-full appearance-none rounded-md border border-input bg-background py-1.5 pr-3 pl-8 text-sm font-medium shadow-sm outline-none ring-offset-background transition-colors",
            "hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring",
          )}
          id="roomId"
          name="roomId"
          defaultValue={selectedRoomId ?? ""}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option disabled value="">
            یک اتاق را انتخاب کنید
          </option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
              {room.location ? ` — ${room.location}` : ""}
              {room.isActive ? "" : " (غیرفعال)"}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </form>
  );
}
