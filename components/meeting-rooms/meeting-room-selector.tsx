"use client";

import { Building2, ChevronDown, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

type MeetingRoomSelectorProps = {
  dateParam: string;
  rooms: Array<{
    id: string;
    location: string | null;
    name: string;
  }>;
  selectedRoomId: string;
};

export function MeetingRoomSelector({
  dateParam,
  rooms,
  selectedRoomId,
}: MeetingRoomSelectorProps) {
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">انتخاب اتاق</h2>
          {selectedRoom?.location ? (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{selectedRoom.location}</span>
            </p>
          ) : null}
        </div>
      </div>

      <form action="/meeting-rooms" className="w-full sm:w-80">
        <input name="date" type="hidden" value={dateParam} />
        <label className="sr-only" htmlFor="meeting-room-id">
          انتخاب اتاق
        </label>
        <div className="relative">
          <select
            className={cn(
              "h-11 w-full appearance-none rounded-md border border-input bg-background py-2 pr-4 pl-10 text-sm font-medium shadow-sm outline-none ring-offset-background transition-colors",
              "hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring",
            )}
            id="meeting-room-id"
            name="roomId"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            value={selectedRoomId}
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      </form>
    </div>
  );
}
