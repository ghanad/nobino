import Link from "next/link";

import { formatJalaliDate, formatLocalTime } from "@/lib/jalali-date";

type Slot = {
  slotStart: Date;
  slotEnd: Date;
  approvedCount: number;
  pendingCount: number;
  capacity: number;
};

type SlotReservationDetail = {
  id: string;
  userName: string;
  status: "APPROVED" | "PENDING";
  reason: string | null;
};

type DailyCapacityCalendarProps = {
  title?: string;
  date: Date;
  dateParam: string;
  previousDateParam: string;
  nextDateParam: string;
  slots: Slot[];
  detailsBySlotStart?: Map<string, SlotReservationDetail[]>;
  emptyMessage?: string;
};

function formatHour(date: Date): string {
  return formatLocalTime(date);
}

function buildDateHref(dateParam: string): string {
  return `?date=${dateParam}`;
}

function getSlotTone(slot: Slot): string {
  const available = slot.capacity - slot.approvedCount;

  if (available <= 0) {
    return "border-red-200 bg-red-50";
  }

  if (slot.pendingCount > 0) {
    return "border-amber-200 bg-amber-50/60";
  }

  return "border-border bg-card";
}

function getDetailClass(status: SlotReservationDetail["status"]): string {
  if (status === "APPROVED") {
    return "bg-emerald-50 text-emerald-900 ring-emerald-200";
  }

  return "bg-amber-50 text-amber-900 ring-amber-200";
}

export function DailyCapacityCalendar({
  title = "Daily availability",
  date,
  dateParam,
  previousDateParam,
  nextDateParam,
  slots,
  detailsBySlotStart,
  emptyMessage = "No working-hour slots are configured for this date.",
}: DailyCapacityCalendarProps) {
  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {formatJalaliDate(date)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent"
            href={buildDateHref(previousDateParam)}
          >
            Previous day
          </Link>
          <form className="flex items-center gap-2" method="get">
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={dateParam}
              dir="ltr"
              name="date"
              pattern="\d{4}[-/]\d{1,2}[-/]\d{1,2}"
              placeholder="1405-02-31"
              title="Enter a Jalali date like 1405-02-31"
              type="text"
            />
            <button
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              type="submit"
            >
              View
            </button>
          </form>
          <Link
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent"
            href={buildDateHref(nextDateParam)}
          >
            Next day
          </Link>
        </div>
      </div>

      {slots.length === 0 ? (
        <p className="mt-5 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          {slots.map((slot) => {
            const available = Math.max(slot.capacity - slot.approvedCount, 0);
            const usagePercent =
              slot.capacity > 0
                ? Math.min((slot.approvedCount / slot.capacity) * 100, 100)
                : 100;
            const pendingPercent =
              slot.capacity > 0
                ? Math.min((slot.pendingCount / slot.capacity) * 100, 100)
                : 0;
            const slotKey = slot.slotStart.toISOString();
            const details = detailsBySlotStart?.get(slotKey) ?? [];

            return (
              <div
                className={`rounded-lg border p-4 ${getSlotTone(slot)}`}
                key={slotKey}
              >
                <div className="grid gap-4 md:grid-cols-[140px_1fr_190px] md:items-center">
                  <div>
                    <p className="text-sm font-medium">
                      {formatHour(slot.slotStart)}-{formatHour(slot.slotEnd)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {available === 0 ? "Full" : `${available} available`}
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <div className="h-2 overflow-hidden rounded-full bg-background ring-1 ring-border">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                    {slot.pendingCount > 0 ? (
                      <div className="h-2 overflow-hidden rounded-full bg-background ring-1 ring-amber-200">
                        <div
                          className="h-full bg-amber-300"
                          style={{ width: `${pendingPercent}%` }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div>
                      <p className="font-semibold text-emerald-800">
                        {slot.approvedCount}
                      </p>
                      <p className="text-muted-foreground">Approved</p>
                    </div>
                    <div>
                      <p className="font-semibold text-amber-800">
                        {slot.pendingCount}
                      </p>
                      <p className="text-muted-foreground">Pending</p>
                    </div>
                    <div>
                      <p className="font-semibold">{slot.capacity}</p>
                      <p className="text-muted-foreground">Capacity</p>
                    </div>
                    <div>
                      <p className="font-semibold">{available}</p>
                      <p className="text-muted-foreground">Open</p>
                    </div>
                  </div>
                </div>

                {details.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {details.map((detail) => (
                      <span
                        className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ring-1 ${getDetailClass(
                          detail.status,
                        )}`}
                        key={`${slotKey}-${detail.id}`}
                        title={detail.reason ?? undefined}
                      >
                        <span>{detail.userName}</span>
                        <span className="text-[10px] opacity-75">
                          {detail.status}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
