"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
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
      className="grid gap-2 p-4 sm:max-w-2xl sm:grid-cols-[minmax(0,1fr)_auto]"
    >
      <input name="view" type="hidden" value={view} />
      <label className="sr-only" htmlFor="roomId">
        اتاق موردنظر
      </label>
      <div className="relative">
        <select
          className={cn(
            "h-11 w-full appearance-none rounded-md border border-input bg-background py-2 pr-4 pl-10 text-sm font-medium shadow-sm outline-none ring-offset-background transition-colors",
            "hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring",
          )}
          id="roomId"
          name="roomId"
          defaultValue={selectedRoomId ?? ""}
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
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      <Button className="w-full sm:w-auto" type="submit">
        نمایش تنظیمات
      </Button>
    </form>
  );
}
