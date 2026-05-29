"use client";

import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { proposeAlternativeDropAction } from "@/app/manager/actions";
import { JALALI_DATE_INPUT_PLACEHOLDER } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type SlotReservationDetail = {
  id: string;
  partySize: number;
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

type ResizeEdge = "start" | "end";

type ResizingReservation = {
  dateParam: string;
  edge: ResizeEdge;
  endHour: number;
  reservationId: string;
  startHour: number;
  status: SlotReservationDetail["status"];
};

type SlotPointerTarget = {
  dateParam: string;
  slotEndHour: number;
  slotStartHour: number;
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

function applyReservationTimeUpdate(
  weekDays: ManagerWeekDay[],
  input: {
    dateParam: string;
    proposedEndHour: number;
    proposedStartHour: number;
    reservationId: string;
  },
): ManagerWeekDay[] {
  const existingDetail = weekDays
    .flatMap((day) => day.slots)
    .flatMap((slot) => slot.details)
    .find((detail) => detail.id === input.reservationId);

  if (!existingDetail) {
    return weekDays;
  }

  return weekDays.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => {
      const hadReservation = slot.details.some(
        (detail) => detail.id === input.reservationId,
      );
      const shouldHaveReservation =
        day.dateParam === input.dateParam &&
        slot.slotStartHour < input.proposedEndHour &&
        slot.slotEndHour > input.proposedStartHour;

      if (hadReservation === shouldHaveReservation) {
        return slot;
      }

      const countDelta = shouldHaveReservation ? 1 : -1;

      return {
        ...slot,
        approvedCount:
          existingDetail.status === "APPROVED"
            ? slot.approvedCount + countDelta
            : slot.approvedCount,
        pendingCount:
          existingDetail.status === "PENDING"
            ? slot.pendingCount + countDelta
            : slot.pendingCount,
        details: shouldHaveReservation
          ? [...slot.details, existingDetail]
          : slot.details.filter((detail) => detail.id !== input.reservationId),
      };
    }),
  }));
}

function ReservationBlock({
  block,
  isDragging,
  isResizing,
  onDragEnd,
  onDragStart,
  onResizeStart,
}: {
  block: PositionedReservationBlock;
  isDragging: boolean;
  isResizing: boolean;
  onDragEnd: () => void;
  onDragStart: (block: PositionedReservationBlock) => void;
  onResizeStart: (
    event: ReactPointerEvent<HTMLElement>,
    block: PositionedReservationBlock,
    edge: ResizeEdge,
  ) => void;
}) {
  const { detail } = block;
  const canDrag = detail.status === "PENDING" || detail.status === "APPROVED";
  const suppressNextClickRef = useRef(false);
  const className = cn(
    "pointer-events-auto relative flex h-full min-w-0 flex-col items-center justify-between gap-2 rounded-md px-1.5 py-2 text-xs font-medium leading-5 shadow-sm ring-1 transition",
    getDetailClass(detail.status),
    canDrag ? "cursor-grab active:cursor-grabbing" : null,
    isDragging || isResizing ? "opacity-45" : null,
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
      {canDrag ? (
        <span
          aria-label="Change reservation start time"
          className="absolute inset-x-1 top-0 h-3 cursor-ns-resize rounded-t-md border-t-2 border-amber-700/70 bg-amber-200/80 opacity-0 transition-opacity hover:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            suppressNextClickRef.current = true;
            onResizeStart(event, block, "start");
          }}
          role="button"
          tabIndex={-1}
          title="Drag to change the start time"
        />
      ) : null}
      <span
        className="min-h-0 max-h-full overflow-hidden text-center leading-4 [text-orientation:mixed] [writing-mode:vertical-rl]"
        title={`${detail.userName} - ${detail.partySize} people`}
      >
        {detail.userName}
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] leading-3 opacity-80">
        <Users aria-hidden="true" className="h-2.5 w-2.5" />
        {detail.partySize}
      </span>
      <span className="shrink-0 text-[9px] uppercase leading-3 opacity-75">
        {canDrag ? "Drag / resize" : getDetailActionLabel(detail.status)}
      </span>
      {canDrag ? (
        <span
          aria-label="Change reservation end time"
          className="absolute inset-x-1 bottom-0 h-3 cursor-ns-resize rounded-b-md border-b-2 border-amber-700/70 bg-amber-200/80 opacity-0 transition-opacity hover:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            suppressNextClickRef.current = true;
            onResizeStart(event, block, "end");
          }}
          role="button"
          tabIndex={-1}
          title="Drag to change the end time"
        />
      ) : null}
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
        onClickCapture={(event) => {
          if (!suppressNextClickRef.current) {
            return;
          }

          suppressNextClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        {...dragProps}
        style={getReservationBlockStyle(block)}
        title={
          canDrag
            ? "Drag to move, or drag the top/bottom edge to resize this reservation"
            : `${detail.partySize} people${detail.reason ? ` - ${detail.reason}` : ""}`
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
      title={`${detail.partySize} people${detail.reason ? ` - ${detail.reason}` : ""}`}
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
  const [localWeekDays, setLocalWeekDays] = useState(weekDays);
  const [resizeOverSlotKey, setResizeOverSlotKey] = useState<string | null>(null);
  const [resizingReservation, setResizingReservation] =
    useState<ResizingReservation | null>(null);
  const [isDropPending, startDropTransition] = useTransition();
  const hours = getHourRange(localWeekDays);
  const reservationBlocksByDate = new Map(
    localWeekDays.map((day) => [
      day.dateParam,
      getPositionedReservationBlocks(day),
    ]),
  );
  const firstHour = hours[0] ?? 0;

  useEffect(() => {
    setLocalWeekDays(weekDays);
  }, [weekDays]);

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

  const submitTimeUpdate = useCallback((input: {
    dateParam: string;
    proposedEndHour: number;
    proposedStartHour: number;
    reservationId: string;
  }) => {
    const formData = new FormData();

    formData.set("reservationId", input.reservationId);
    formData.set("proposedDate", input.dateParam);
    formData.set("proposedStartHour", input.proposedStartHour.toString());
    formData.set("proposedEndHour", input.proposedEndHour.toString());
    formData.set("date", currentDateParam);

    startDropTransition(async () => {
      const result = await proposeAlternativeDropAction(formData);

      if (!result.ok) {
        setDropError(result.error);
        return;
      }

      setDropError(null);
      setLocalWeekDays((currentWeekDays) =>
        applyReservationTimeUpdate(currentWeekDays, input),
      );
    });
  }, [currentDateParam]);

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    day: ManagerWeekDay,
    slot: ManagerWeekSlot | null,
  ) {
    event.preventDefault();
    setDragOverSlotKey(null);

    const dragged = readDraggedReservation(event);

      if (
        !slot ||
        !dragged ||
        (dragged.status !== "PENDING" && dragged.status !== "APPROVED")
      ) {
      return;
    }

    const proposedEndHour = slot.slotStartHour + dragged.durationHours;

    submitTimeUpdate({
      dateParam: day.dateParam,
      proposedEndHour,
      proposedStartHour: slot.slotStartHour,
      reservationId: dragged.reservationId,
    });
  }

  function getSlotPointerTarget(
    clientX: number,
    clientY: number,
  ): SlotPointerTarget | null {
    const elements = document.elementsFromPoint(clientX, clientY);
    const cell = elements
      .map((element) =>
        element instanceof HTMLElement
          ? element.closest<HTMLElement>("[data-manager-calendar-cell='true']")
          : null,
      )
      .find((element): element is HTMLElement => Boolean(element));

    if (!cell) {
      return null;
    }

    const dateParam = cell.dataset.dateParam;
    const slotStartHour = Number(cell.dataset.slotStartHour);
    const slotEndHour = Number(cell.dataset.slotEndHour);

    if (
      !dateParam ||
      !Number.isInteger(slotStartHour) ||
      !Number.isInteger(slotEndHour)
    ) {
      return null;
    }

    return { dateParam, slotEndHour, slotStartHour };
  }

  useEffect(() => {
    if (!resizingReservation) {
      return;
    }

    const resizing = resizingReservation;

    function handlePointerMove(event: PointerEvent) {
      const target = getSlotPointerTarget(event.clientX, event.clientY);

      if (!target || target.dateParam !== resizing.dateParam) {
        setResizeOverSlotKey(null);
        return;
      }

      setResizeOverSlotKey(
        `${target.dateParam}-${target.slotStartHour}-${resizing.edge}`,
      );
    }

    function handlePointerUp(event: PointerEvent) {
      const target = getSlotPointerTarget(event.clientX, event.clientY);

      setResizeOverSlotKey(null);
      setResizingReservation(null);

      if (
        !target ||
        target.dateParam !== resizing.dateParam ||
        (resizing.status !== "PENDING" && resizing.status !== "APPROVED")
      ) {
        return;
      }

      const proposedStartHour =
        resizing.edge === "start"
          ? target.slotStartHour
          : resizing.startHour;
      const proposedEndHour =
        resizing.edge === "end"
          ? target.slotEndHour
          : resizing.endHour;

      if (
        proposedStartHour === resizing.startHour &&
        proposedEndHour === resizing.endHour
      ) {
        return;
      }

      if (proposedEndHour <= proposedStartHour) {
        setDropError("Reservation must be at least 1 hour long.");
        return;
      }

      submitTimeUpdate({
        dateParam: resizing.dateParam,
        proposedEndHour,
        proposedStartHour,
        reservationId: resizing.reservationId,
      });
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizingReservation, submitTimeUpdate]);

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
              and consume capacity. Drag amber or green reservations onto another
              working hour to update their time. Drag the top or bottom edge to
              change duration.
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
                  {localWeekDays.map((day) => (
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
                    localWeekDays.map((day, dayIndex) => {
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
                            resizeOverSlotKey ===
                              `${day.dateParam}-${hour}-start` ||
                              resizeOverSlotKey === `${day.dateParam}-${hour}-end`
                              ? "outline outline-2 outline-amber-600"
                              : null,
                          )}
                          data-date-param={day.dateParam}
                          data-manager-calendar-cell="true"
                          data-slot-end-hour={slot?.slotEndHour}
                          data-slot-start-hour={slot?.slotStartHour}
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

                  {localWeekDays.flatMap((day, dayIndex) =>
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
                              isResizing={
                                resizingReservation?.reservationId ===
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
                              onResizeStart={(event, resizeBlock, edge) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setDropError(null);
                                setDraggedReservation(null);
                                setDragOverSlotKey(null);
                                setResizingReservation({
                                  dateParam: day.dateParam,
                                  edge,
                                  endHour: resizeBlock.endHour,
                                  reservationId: resizeBlock.detail.id,
                                  startHour: resizeBlock.startHour,
                                  status: resizeBlock.detail.status,
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
