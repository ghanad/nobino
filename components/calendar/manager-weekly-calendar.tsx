"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type DragEvent } from "react";

import { proposeAlternativeDropAction } from "@/app/manager/actions";
import { JALALI_DATE_INPUT_PLACEHOLDER } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type SlotReservationDetail = {
  id: string;
  userName: string;
  status: "ALTERNATIVE_PROPOSED" | "APPROVED" | "PENDING";
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
  closedReason: string | null;
  dateLabel: string;
  dateParam: string;
  shortLabel: string;
  slots: ManagerWeekSlot[];
};

type SlotReservationBlock = {
  detail: SlotReservationDetail;
  startHour: number;
  endHour: number;
};

type PositionedReservationBlock = SlotReservationBlock & {
  lane: number;
  laneCount: number;
};

type DraggedReservation = {
  durationHours: number;
  reservationId: string;
  status: SlotReservationDetail["status"];
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

  if (status === "ALTERNATIVE_PROPOSED") {
    return "bg-sky-100 text-sky-900 ring-sky-300";
  }

  return "bg-amber-100 text-amber-950 ring-amber-300";
}

function getDetailActionLabel(status: SlotReservationDetail["status"]): string {
  if (status === "PENDING") {
    return "Review";
  }

  if (status === "ALTERNATIVE_PROPOSED") {
    return "Proposed";
  }

  return "Details";
}

function getReservationBlocks(day: ManagerWeekDay): SlotReservationBlock[] {
  const blocksById = new Map<string, SlotReservationBlock>();

  for (const slot of day.slots) {
    for (const detail of slot.details) {
      const current = blocksById.get(detail.id);

      if (!current) {
        blocksById.set(detail.id, {
          detail,
          startHour: slot.slotStartHour,
          endHour: slot.slotEndHour,
        });
        continue;
      }

      current.startHour = Math.min(current.startHour, slot.slotStartHour);
      current.endHour = Math.max(current.endHour, slot.slotEndHour);
    }
  }

  return Array.from(blocksById.values());
}

function getPositionedReservationBlocks(
  day: ManagerWeekDay,
): PositionedReservationBlock[] {
  const blocks = getReservationBlocks(day).sort(
    (left, right) =>
      left.startHour - right.startHour || left.endHour - right.endHour,
  );
  const laneEndHours: number[] = [];
  const positionedBlocks = blocks.map((block) => {
    const availableLane = laneEndHours.findIndex(
      (endHour) => endHour <= block.startHour,
    );
    const lane = availableLane >= 0 ? availableLane : laneEndHours.length;
    laneEndHours[lane] = block.endHour;

    return {
      ...block,
      lane,
      laneCount: 1,
    };
  });
  const laneCount = Math.max(laneEndHours.length, 1);

  return positionedBlocks.map((block) => ({
    ...block,
    laneCount,
  }));
}

function getReservationBlockStyle(block: PositionedReservationBlock) {
  const laneWidth = 100 / block.laneCount;

  return {
    marginLeft: `calc(${block.lane * laneWidth}% + 0.25rem)`,
    width: `calc(${laneWidth}% - 0.5rem)`,
  };
}

function ReservationBlock({
  block,
  isDragging,
  onDragEnd,
  onDragStart,
}: {
  block: PositionedReservationBlock;
  isDragging: boolean;
  onDragEnd: () => void;
  onDragStart: (block: PositionedReservationBlock) => void;
}) {
  const { detail } = block;
  const canDrag = detail.status === "PENDING";
  const className = cn(
    "pointer-events-auto flex h-full min-w-0 flex-col items-center justify-between gap-2 rounded-md px-1.5 py-2 text-xs font-medium leading-5 shadow-sm ring-1 transition",
    getDetailClass(detail.status),
    canDrag ? "cursor-grab active:cursor-grabbing" : null,
    isDragging ? "opacity-45" : null,
  );
  const dragProps = canDrag
    ? {
        draggable: true,
        onDragEnd,
        onDragStart: (event: DragEvent<HTMLElement>) => {
          const payload: DraggedReservation = {
            durationHours: block.endHour - block.startHour,
            reservationId: detail.id,
            status: detail.status,
          };

          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(
            "application/x-nobino-reservation",
            JSON.stringify(payload),
          );
          onDragStart(block);
        },
      }
    : {};
  const content = (
    <>
      <span
        className="min-h-0 max-h-full overflow-hidden text-center leading-4 [text-orientation:mixed] [writing-mode:vertical-rl]"
        title={detail.userName}
      >
        {detail.userName}
      </span>
      <span className="shrink-0 text-[9px] uppercase leading-3 opacity-75">
        {canDrag ? "Drag" : getDetailActionLabel(detail.status)}
      </span>
    </>
  );

  if (detail.href) {
    const hoverClass =
      detail.status === "APPROVED" ? "hover:bg-emerald-200" : "hover:bg-amber-200";

    return (
      <a
        className={cn(
          className,
          hoverClass,
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        href={detail.href}
        {...dragProps}
        style={getReservationBlockStyle(block)}
        title={
          canDrag
            ? "Drag to a working hour to update this pending request time"
            : detail.reason ?? undefined
        }
      >
        {content}
      </a>
    );
  }

  return (
    <span
      className={className}
      {...dragProps}
      style={getReservationBlockStyle(block)}
      title={detail.reason ?? undefined}
    >
      {content}
    </span>
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
  const [draggedReservation, setDraggedReservation] =
    useState<DraggedReservation | null>(null);
  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [isDropPending, startDropTransition] = useTransition();
  const hours = getHourRange(weekDays);
  const reservationBlocksByDate = new Map(
    weekDays.map((day) => [day.dateParam, getPositionedReservationBlocks(day)]),
  );
  const firstHour = hours[0] ?? 0;

  function readDraggedReservation(
    event: DragEvent<HTMLElement>,
  ): DraggedReservation | null {
    if (draggedReservation) {
      return draggedReservation;
    }

    const rawPayload = event.dataTransfer.getData(
      "application/x-nobino-reservation",
    );

    if (!rawPayload) {
      return null;
    }

    try {
      return JSON.parse(rawPayload) as DraggedReservation;
    } catch {
      return null;
    }
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    day: ManagerWeekDay,
    slot: ManagerWeekSlot | null,
  ) {
    event.preventDefault();
    setDragOverSlotKey(null);

    const dragged = readDraggedReservation(event);

    if (!slot || !dragged || dragged.status !== "PENDING") {
      return;
    }

    const proposedEndHour = slot.slotStartHour + dragged.durationHours;
    const formData = new FormData();

    formData.set("reservationId", dragged.reservationId);
    formData.set("proposedDate", day.dateParam);
    formData.set("proposedStartHour", slot.slotStartHour.toString());
    formData.set("proposedEndHour", proposedEndHour.toString());
    formData.set("date", currentDateParam);

    startDropTransition(async () => {
      const result = await proposeAlternativeDropAction(formData);

      if (!result.ok) {
        setDropError(result.error);
        return;
      }

      const searchParams = new URLSearchParams({ date: currentDateParam });
      searchParams.set("alternative", "1");
      window.location.href = `/manager?${searchParams.toString()}`;
    });
  }

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

        <div
          className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
          dir="ltr"
        >
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
              and consume capacity. Drag amber requests onto another working
              hour to update their pending time.
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

      {dropError ? (
        <div
          className="mt-4 rounded-md border border-destructive/30 bg-background p-3 text-sm leading-6 text-destructive"
          role="alert"
        >
          {dropError}
        </div>
      ) : null}

      {hours.length === 0 ? (
        <p className="mt-5 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div
          className="mt-5 overflow-hidden rounded-lg border bg-background shadow-sm"
          dir="ltr"
        >
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div>
                <div className="sticky top-0 z-20 grid grid-cols-[72px_repeat(7,minmax(124px,1fr))] border-b bg-background">
                  <div className="border-r px-3 py-3 text-xs font-medium text-muted-foreground" />
                  {weekDays.map((day) => (
                    <div
                      className="border-r px-3 py-3 text-center text-sm font-semibold last:border-r-0"
                      key={day.dateParam}
                      title={day.dateLabel}
                      dir="rtl"
                    >
                      <span>{day.shortLabel}</span>
                      {day.closedReason ? (
                        <span className="mt-1 block text-[11px] font-medium leading-4 text-red-700">
                          {day.closedReason}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div
                  className="grid grid-cols-[72px_repeat(7,minmax(124px,1fr))]"
                  style={{
                    gridTemplateRows: `repeat(${hours.length}, minmax(6rem, auto))`,
                  }}
                >
                  {hours.map((hour, hourIndex) => (
                    <div
                      className="relative border-b border-r bg-background"
                      key={`time-${hour}`}
                      style={{ gridColumn: 1, gridRow: hourIndex + 1 }}
                    >
                      <span className="absolute right-3 top-2 text-xs font-medium text-muted-foreground">
                        {formatHour(hour)}
                      </span>
                    </div>
                  ))}

                  {hours.map((hour, hourIndex) =>
                    weekDays.map((day, dayIndex) => {
                      const slot = getSlotForHour(day, hour);
                      const available = slot
                        ? Math.max(slot.capacity - slot.approvedCount, 0)
                        : 0;

                      return (
                        <div
                          className={cn(
                            "border-b border-r p-2 text-left transition-colors",
                            getCellTone(slot),
                            draggedReservation && slot
                              ? "outline-offset-[-2px]"
                              : null,
                            dragOverSlotKey === `${day.dateParam}-${hour}`
                              ? "outline outline-2 outline-sky-500"
                              : null,
                          )}
                          onDragLeave={() => setDragOverSlotKey(null)}
                          onDragOver={(event) => {
                            if (!slot || !draggedReservation || isDropPending) {
                              return;
                            }

                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDragOverSlotKey(`${day.dateParam}-${hour}`);
                          }}
                          onDrop={(event) => handleDrop(event, day, slot)}
                          key={`${day.dateParam}-${hour}`}
                          style={{
                            gridColumn: dayIndex + 2,
                            gridRow: hourIndex + 1,
                          }}
                        >
                          {slot ? (
                            <div className="grid min-h-20 content-start gap-1">
                              <div className="flex items-start justify-between gap-2 text-[11px] leading-4">
                                <span className="font-medium">Capacity</span>
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
                            </div>
                          ) : (
                            <span className="sr-only">Not working hour</span>
                          )}
                        </div>
                      );
                    }),
                  )}

                  {weekDays.flatMap((day, dayIndex) =>
                    (reservationBlocksByDate.get(day.dateParam) ?? []).map(
                      (block) => {
                        const startLine = block.startHour - firstHour + 1;
                        const endLine = block.endHour - firstHour + 1;

                        return (
                          <div
                            className="pointer-events-none z-10 p-2"
                            key={`${day.dateParam}-${block.detail.id}`}
                            style={{
                              gridColumn: dayIndex + 2,
                              gridRow: `${startLine} / ${endLine}`,
                            }}
                          >
                            <ReservationBlock
                              block={block}
                              isDragging={
                                draggedReservation?.reservationId ===
                                block.detail.id
                              }
                              onDragEnd={() => {
                                setDraggedReservation(null);
                                setDragOverSlotKey(null);
                              }}
                              onDragStart={(dragBlock) => {
                                setDropError(null);
                                setDraggedReservation({
                                  durationHours:
                                    dragBlock.endHour - dragBlock.startHour,
                                  reservationId: dragBlock.detail.id,
                                  status: dragBlock.detail.status,
                                });
                              }}
                            />
                          </div>
                        );
                      },
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
