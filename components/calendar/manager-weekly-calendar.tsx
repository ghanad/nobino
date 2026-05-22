import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { JALALI_DATE_INPUT_PLACEHOLDER } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type SlotReservationDetail = {
  id: string;
  userName: string;
  status: "APPROVED" | "PENDING";
  reason: string | null;
  href?: string;
};

type ManagerWeekSlot = {
  slotStartHour: number;
  slotEndHour: number;
  approvedCount: number;
  pendingCount: number;
  capacity: number;
  details: SlotReservationDetail[];
};

type ManagerWeekDay = {
  dateLabel: string;
  dateParam: string;
  shortLabel: string;
  slots: ManagerWeekSlot[];
};

type ManagerWeeklyCalendarProps = {
  currentDateParam: string;
  emptyMessage: string;
  nextWeekDateParam: string;
  previousWeekDateParam: string;
  title: string;
  weekDays: ManagerWeekDay[];
  weekLabel: string;
};

function buildDateHref(dateParam: string): string {
  return `?date=${dateParam}`;
}

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

function getHourRange(weekDays: ManagerWeekDay[]): number[] {
  const slotHours = weekDays.flatMap((day) =>
    day.slots.flatMap((slot) => [slot.slotStartHour, slot.slotEndHour]),
  );

  if (slotHours.length === 0) {
    return [];
  }

  const minHour = Math.min(...slotHours);
  const maxHour = Math.max(...slotHours);

  return Array.from({ length: maxHour - minHour }, (_, index) => minHour + index);
}

function getSlotForHour(
  day: ManagerWeekDay,
  hour: number,
): ManagerWeekSlot | null {
  return day.slots.find((slot) => slot.slotStartHour === hour) ?? null;
}

function getCellTone(slot: ManagerWeekSlot | null): string {
  if (!slot) {
    return "bg-muted/30 text-muted-foreground";
  }

  if (slot.approvedCount >= slot.capacity) {
    return "bg-red-50/80 text-red-900";
  }

  if (slot.pendingCount > 0) {
    return "bg-amber-50/80 text-amber-950";
  }

  if (slot.approvedCount > 0) {
    return "bg-emerald-50/70 text-emerald-950";
  }

  return "bg-background hover:bg-sky-50/60";
}

function getDetailClass(status: SlotReservationDetail["status"]): string {
  if (status === "APPROVED") {
    return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  }

  return "bg-amber-100 text-amber-950 ring-amber-300";
}

function getDetailActionLabel(status: SlotReservationDetail["status"]): string {
  if (status === "PENDING") {
    return "Review";
  }

  return "Approved";
}

function SlotDetails({ details }: { details: SlotReservationDetail[] }) {
  if (details.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 grid gap-1">
      {details.map((detail) => {
        const className = `inline-flex min-w-0 max-w-full items-center justify-between gap-1 rounded-sm px-1.5 py-1 text-[11px] font-medium leading-4 ring-1 ${getDetailClass(
          detail.status,
        )}`;
        const content = (
          <>
            <span className="truncate">{detail.userName}</span>
            <span className="shrink-0 text-[10px] opacity-75">
              {getDetailActionLabel(detail.status)}
            </span>
          </>
        );

        return detail.href ? (
          <a
            className={`${className} transition-colors hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            href={detail.href}
            key={detail.id}
            title={detail.reason ?? undefined}
          >
            {content}
          </a>
        ) : (
          <span className={className} key={detail.id} title={detail.reason ?? undefined}>
            {content}
          </span>
        );
      })}
    </div>
  );
}

export function ManagerWeeklyCalendar({
  currentDateParam,
  emptyMessage,
  nextWeekDateParam,
  previousWeekDateParam,
  title,
  weekDays,
  weekLabel,
}: ManagerWeeklyCalendarProps) {
  const hours = getHourRange(weekDays);

  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground">
      <div className="grid gap-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div>
            <h2 className="font-medium">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {weekLabel}
            </p>
          </div>

          <form className="flex items-center gap-2" method="get">
            <input
              className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={currentDateParam}
              dir="ltr"
              name="date"
              pattern="\d{4}[-/]\d{1,2}[-/]\d{1,2}"
              placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
              title={`Enter a Jalali date like ${JALALI_DATE_INPUT_PLACEHOLDER}`}
              type="text"
            />
            <button
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              type="submit"
            >
              View
            </button>
          </form>
        </div>

        <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent sm:justify-self-start"
            href={buildDateHref(previousWeekDateParam)}
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            Previous week
          </Link>
          <div className="order-first text-center sm:order-none">
            <p className="text-sm font-medium">Approval calendar</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Amber requests are pending review; green reservations are approved
              and consume capacity.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent sm:justify-self-end"
            href={buildDateHref(nextWeekDateParam)}
          >
            Next week
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {hours.length === 0 ? (
        <p className="mt-5 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div className="mt-5 overflow-hidden rounded-lg border bg-background shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[72px_repeat(7,minmax(124px,1fr))] border-b bg-background">
                <div className="border-r px-3 py-3 text-xs font-medium text-muted-foreground" />
                {weekDays.map((day) => (
                  <div
                    className="border-r px-3 py-3 text-center text-sm font-semibold last:border-r-0"
                    key={day.dateParam}
                    title={day.dateLabel}
                  >
                    {day.shortLabel}
                  </div>
                ))}
              </div>

              <div className="max-h-[560px] overflow-y-auto">
                {hours.map((hour) => (
                  <div
                    className="grid min-h-24 grid-cols-[72px_repeat(7,minmax(124px,1fr))] border-b last:border-b-0"
                    key={hour}
                  >
                    <div className="relative border-r bg-background">
                      <span className="absolute right-3 top-2 text-xs font-medium text-muted-foreground">
                        {formatHour(hour)}
                      </span>
                    </div>
                    {weekDays.map((day) => {
                      const slot = getSlotForHour(day, hour);
                      const available = slot
                        ? Math.max(slot.capacity - slot.approvedCount, 0)
                        : 0;

                      return (
                        <div
                          className={cn(
                            "border-r p-2 text-left last:border-r-0",
                            getCellTone(slot),
                          )}
                          key={`${day.dateParam}-${hour}`}
                        >
                          {slot ? (
                            <div className="grid min-h-20 content-start gap-1">
                              <div className="flex items-start justify-between gap-2 text-[11px] leading-4">
                                <span className="font-medium">
                                  {formatHour(slot.slotStartHour)}-
                                  {formatHour(slot.slotEndHour)}
                                </span>
                                <span className="shrink-0 text-muted-foreground">
                                  {available}/{slot.capacity} open
                                </span>
                              </div>
                              {slot.approvedCount > 0 || slot.pendingCount > 0 ? (
                                <div className="flex flex-wrap gap-1 text-[10px] leading-4">
                                  {slot.approvedCount > 0 ? (
                                    <span className="rounded-sm bg-emerald-100 px-1 text-emerald-900">
                                      {slot.approvedCount} approved
                                    </span>
                                  ) : null}
                                  {slot.pendingCount > 0 ? (
                                    <span className="rounded-sm bg-amber-100 px-1 text-amber-950">
                                      {slot.pendingCount} pending
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                              <SlotDetails details={slot.details} />
                            </div>
                          ) : (
                            <span className="sr-only">Not working hour</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
