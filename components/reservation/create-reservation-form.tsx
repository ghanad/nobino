"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { JALALI_DATE_INPUT_PLACEHOLDER } from "@/lib/jalali-date";
import { cn } from "@/lib/utils";

type ResourcePoolOption = {
  id: string;
  name: string;
};

type RequestableSlot = {
  slotStartHour: number;
  slotEndHour: number;
  isRequestable: boolean;
  myReservationId: string | null;
  myReservationStatus: "APPROVED" | "PENDING" | null;
  unavailableReason: "full" | "past" | null;
};

type WeekDay = {
  closedReason: string | null;
  dateLabel: string;
  modalDateLabel: string;
  dateParam: string;
  shortLabel: string;
  slots: RequestableSlot[];
};

type CreateReservationFormProps = {
  action: (formData: FormData) => Promise<void>;
  currentDateParam: string;
  emptyMessage: string;
  nextWeekDateParam: string;
  previousWeekDateParam: string;
  resourcePools: ResourcePoolOption[];
  weekDays: WeekDay[];
  weekLabel: string;
};

type Selection = {
  anchorHour: number;
  dateParam: string;
  dayIndex: number;
  endHour: number;
  startHour: number;
};

type CellState = {
  isRequestable: boolean;
  isWorkingHour: boolean;
  myReservationId: string | null;
  myReservationStatus: "APPROVED" | "PENDING" | null;
  unavailableReason: "full" | "past" | null;
};

type MyReservationBlock = {
  id: string;
  status: "APPROVED" | "PENDING";
  startHour: number;
  endHour: number;
};

type FullCapacityBlock = {
  endHour: number;
  startHour: number;
};

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

const PERSIAN_HOUR_FORMATTER = new Intl.NumberFormat("fa-IR", {
  minimumIntegerDigits: 2,
  useGrouping: false,
});

function formatPersianHour(hour: number): string {
  return `${PERSIAN_HOUR_FORMATTER.format(hour)}:۰۰`;
}

function buildDateHref(dateParam: string): string {
  return `?date=${dateParam}`;
}

function getHourRange(weekDays: WeekDay[]): number[] {
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

function getCellState(day: WeekDay, hour: number): CellState {
  const slot = day.slots.find((item) => item.slotStartHour === hour);

  if (!slot) {
    return {
      isRequestable: false,
      isWorkingHour: false,
      myReservationId: null,
      myReservationStatus: null,
      unavailableReason: null,
    };
  }

  return {
    isRequestable: slot.isRequestable,
    isWorkingHour: true,
    myReservationId: slot.myReservationId,
    myReservationStatus: slot.myReservationStatus,
    unavailableReason: slot.unavailableReason,
  };
}

function getMyReservationLabel(status: CellState["myReservationStatus"]): string {
  if (status === "PENDING") {
    return "Your request is pending";
  }

  if (status === "APPROVED") {
    return "Your approved reservation";
  }

  return "";
}

function getUnavailableLabel(
  reason: CellState["unavailableReason"],
): string {
  if (reason === "full") {
    return "No system available";
  }

  if (reason === "past") {
    return "Past time";
  }

  return "";
}

function getMyReservationBlocks(day: WeekDay): MyReservationBlock[] {
  const blocksById = new Map<string, MyReservationBlock>();

  for (const slot of day.slots) {
    if (!slot.myReservationId || !slot.myReservationStatus) {
      continue;
    }

    const current = blocksById.get(slot.myReservationId);

    if (!current) {
      blocksById.set(slot.myReservationId, {
        id: slot.myReservationId,
        status: slot.myReservationStatus,
        startHour: slot.slotStartHour,
        endHour: slot.slotEndHour,
      });
      continue;
    }

    current.startHour = Math.min(current.startHour, slot.slotStartHour);
    current.endHour = Math.max(current.endHour, slot.slotEndHour);
  }

  return Array.from(blocksById.values()).sort(
    (left, right) =>
      left.startHour - right.startHour || left.endHour - right.endHour,
  );
}

function getFullCapacityBlocks(day: WeekDay): FullCapacityBlock[] {
  const blocks: FullCapacityBlock[] = [];

  for (const slot of day.slots) {
    if (slot.unavailableReason !== "full" || slot.myReservationStatus) {
      continue;
    }

    const previous = blocks.at(-1);

    if (previous && previous.endHour === slot.slotStartHour) {
      previous.endHour = slot.slotEndHour;
      continue;
    }

    blocks.push({
      startHour: slot.slotStartHour,
      endHour: slot.slotEndHour,
    });
  }

  return blocks;
}

function MyReservationBlockView({ block }: { block: MyReservationBlock }) {
  return (
    <span
      className={cn(
        "flex h-full min-h-8 items-start justify-center rounded-md px-2 py-2 text-center text-xs font-semibold leading-4 shadow-sm ring-1",
        block.status === "PENDING"
          ? "bg-amber-100 text-amber-900 ring-amber-200"
          : "bg-emerald-100 text-emerald-900 ring-emerald-200",
      )}
    >
      {block.status === "PENDING" ? "My pending" : "My approved"}
    </span>
  );
}

function FullCapacityBlockView() {
  return (
    <span className="flex h-full min-h-8 items-start justify-center rounded-md bg-red-100 px-2 py-2 text-center text-xs font-semibold leading-4 text-red-800 shadow-sm ring-1 ring-red-200">
      No system available
    </span>
  );
}

function selectionContainsHour(
  selection: Selection | null,
  dayIndex: number,
  hour: number,
) {
  if (!selection || selection.dayIndex !== dayIndex) {
    return false;
  }

  return hour >= selection.startHour && hour < selection.endHour;
}

function isSelectionStart(
  selection: Selection | null,
  dayIndex: number,
  hour: number,
) {
  return Boolean(
    selection && selection.dayIndex === dayIndex && selection.startHour === hour,
  );
}

function isSelectionEnd(selection: Selection | null, dayIndex: number, hour: number) {
  return Boolean(
    selection && selection.dayIndex === dayIndex && selection.endHour === hour + 1,
  );
}

function buildSelection(
  weekDays: WeekDay[],
  dayIndex: number,
  anchorHour: number,
  targetHour: number,
): Selection | null {
  const day = weekDays[dayIndex];

  if (!day) {
    return null;
  }

  const step = targetHour >= anchorHour ? 1 : -1;
  let boundedHour = anchorHour;

  for (
    let hour = anchorHour + step;
    step > 0 ? hour <= targetHour : hour >= targetHour;
    hour += step
  ) {
    if (!getCellState(day, hour).isRequestable) {
      break;
    }

    boundedHour = hour;
  }

  const startHour = Math.min(anchorHour, boundedHour);
  const endHour = Math.max(anchorHour, boundedHour) + 1;

  return {
    anchorHour,
    dateParam: day.dateParam,
    dayIndex,
    endHour,
    startHour,
  };
}

export function CreateReservationForm({
  action,
  currentDateParam,
  emptyMessage,
  nextWeekDateParam,
  previousWeekDateParam,
  resourcePools,
  weekDays,
  weekLabel,
}: CreateReservationFormProps) {
  const defaultPool = resourcePools[0];
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReasonDialogOpen, setIsReasonDialogOpen] = useState(false);
  const selectionRef = useRef<Selection | null>(null);
  const hours = useMemo(() => getHourRange(weekDays), [weekDays]);
  const firstHour = hours[0] ?? 0;
  const myReservationBlocksByDate = useMemo(
    () =>
      new Map(
        weekDays.map((day) => [day.dateParam, getMyReservationBlocks(day)]),
      ),
    [weekDays],
  );
  const fullCapacityBlocksByDate = useMemo(
    () =>
      new Map(
        weekDays.map((day) => [day.dateParam, getFullCapacityBlocks(day)]),
      ),
    [weekDays],
  );
  const weekKey = weekDays.map((day) => day.dateParam).join("|");
  useEffect(() => {
    selectionRef.current = null;
    setSelection(null);
    setIsDragging(false);
    setIsReasonDialogOpen(false);
  }, [weekKey]);

  useEffect(() => {
    if (!isReasonDialogOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsReasonDialogOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isReasonDialogOpen]);

  function startSelection(
    dayIndex: number,
    hour: number,
    pointerId: number,
    target: HTMLElement,
  ) {
    if (!getCellState(weekDays[dayIndex], hour).isRequestable) {
      return;
    }

    target.setPointerCapture(pointerId);
    setIsDragging(true);
    setIsReasonDialogOpen(false);
    const nextSelection = buildSelection(weekDays, dayIndex, hour, hour);
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
  }

  function updateSelection(dayIndex: number, hour: number) {
    setSelection((current) => {
      if (!current || current.dayIndex !== dayIndex) {
        return current;
      }

      const nextSelection = buildSelection(
        weekDays,
        dayIndex,
        current.anchorHour,
        hour,
      );
      selectionRef.current = nextSelection;
      return nextSelection;
    });
  }

  function finishSelection() {
    setIsDragging(false);

    if (selectionRef.current) {
      setIsReasonDialogOpen(true);
    }
  }

  function updateSelectionFromPoint(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY);
    const cell = element?.closest<HTMLElement>("[data-calendar-cell='true']");

    if (!cell) {
      return;
    }

    const dayIndex = Number(cell.dataset.dayIndex);
    const hour = Number(cell.dataset.hour);

    if (Number.isNaN(dayIndex) || Number.isNaN(hour)) {
      return;
    }

    updateSelection(dayIndex, hour);
  }

  return (
    <>
      <form id="reservation-week-navigation" method="get" />
      <form action={action} className="grid gap-5 rounded-lg border bg-card p-5">
        <div className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="max-w-3xl">
              <h2 className="font-medium">New reservation request</h2>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative sm:w-44">
                <CalendarDays
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
                  defaultValue={currentDateParam}
                  dir="ltr"
                  form="reservation-week-navigation"
                  name="date"
                  pattern="\d{4}[-/]\d{1,2}[-/]\d{1,2}"
                  placeholder={JALALI_DATE_INPUT_PLACEHOLDER}
                  title={`Enter a Jalali date like ${JALALI_DATE_INPUT_PLACEHOLDER}`}
                  type="text"
                />
              </div>
              <button
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                form="reservation-week-navigation"
                type="submit"
              >
                View
              </button>
            </div>
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
              <p className="text-sm font-medium">{weekLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                White slots are requestable. Amber marks your pending requests;
                green marks your approved reservations.
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

        <input name="resourcePoolId" type="hidden" value={defaultPool?.id ?? ""} />
        <input name="date" type="hidden" value={selection?.dateParam ?? ""} />
        <input name="startHour" type="hidden" value={selection?.startHour ?? ""} />
        <input name="endHour" type="hidden" value={selection?.endHour ?? ""} />

        <div className="grid gap-3">
          {hours.length === 0 || !defaultPool ? (
            <p className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
              {defaultPool ? emptyMessage : "No active resource pool is configured."}
            </p>
          ) : (
            <div
              className="overflow-hidden rounded-lg border bg-background shadow-sm"
              onPointerLeave={() => setIsDragging(false)}
              onPointerUp={finishSelection}
            >
              <div className="overflow-x-auto">
                <div className="min-w-[920px]">
                  <div className="grid grid-cols-[72px_repeat(7,minmax(116px,1fr))] border-b bg-background">
                    <div className="border-r px-3 py-3 text-xs font-medium text-muted-foreground" />
                    {weekDays.map((day) => (
                      <div
                        className="border-r px-3 py-3 text-center text-sm font-semibold last:border-r-0"
                        key={day.dateParam}
                        title={day.dateLabel}
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

                  <div className="max-h-[460px] overflow-y-auto">
                    <div
                      className="grid touch-none select-none grid-cols-[72px_repeat(7,minmax(116px,1fr))]"
                      style={{
                        gridTemplateRows: `repeat(${hours.length}, 3rem)`,
                      }}
                    >
                      {hours.map((hour, hourIndex) => (
                        <div
                          className="relative border-b border-r bg-background"
                          key={`time-${hour}`}
                          style={{ gridColumn: 1, gridRow: hourIndex + 1 }}
                        >
                          <span className="absolute right-3 top-1 text-xs font-medium text-muted-foreground">
                            {formatHour(hour)}
                          </span>
                        </div>
                      ))}

                      {hours.map((hour, hourIndex) =>
                        weekDays.map((day, dayIndex) => {
                          const cell = getCellState(day, hour);
                          const isSelected = selectionContainsHour(
                            selection,
                            dayIndex,
                            hour,
                          );
                          const startsSelection = isSelectionStart(
                            selection,
                            dayIndex,
                            hour,
                          );
                          const endsSelection = isSelectionEnd(
                            selection,
                            dayIndex,
                            hour,
                          );
                          const myReservationLabel = getMyReservationLabel(
                            cell.myReservationStatus,
                          );
                          const unavailableLabel = getUnavailableLabel(
                            cell.myReservationStatus ? null : cell.unavailableReason,
                          );

                          return (
                            <button
                              aria-label={[
                                day.dateLabel,
                                formatHour(hour),
                                myReservationLabel,
                                unavailableLabel,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              aria-pressed={isSelected}
                              className={cn(
                                "relative border-b border-r bg-background p-0 text-left focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                dayIndex === weekDays.length - 1 && "border-r-0",
                                !cell.isWorkingHour &&
                                  "cursor-not-allowed bg-muted/30",
                                cell.isWorkingHour &&
                                  cell.unavailableReason === "full" &&
                                  "cursor-not-allowed bg-red-50/80 text-red-800",
                                cell.isWorkingHour &&
                                  cell.unavailableReason === "past" &&
                                  "cursor-not-allowed bg-muted/50 text-muted-foreground",
                                cell.isWorkingHour &&
                                  cell.myReservationStatus === "PENDING" &&
                                  "bg-amber-50/80 text-amber-900",
                                cell.isWorkingHour &&
                                  cell.myReservationStatus === "APPROVED" &&
                                  "bg-emerald-50/80 text-emerald-900",
                                cell.isRequestable && "hover:bg-sky-50/60",
                              )}
                              data-calendar-cell="true"
                              data-day-index={dayIndex}
                              data-hour={hour}
                              disabled={!cell.isRequestable}
                              key={`${day.dateParam}-${hour}`}
                              onPointerDown={(event) =>
                                startSelection(
                                  dayIndex,
                                  hour,
                                  event.pointerId,
                                  event.currentTarget,
                                )
                              }
                              onPointerEnter={() => {
                                if (isDragging) {
                                  updateSelection(dayIndex, hour);
                                }
                              }}
                              onPointerMove={(event) => {
                                if (isDragging) {
                                  updateSelectionFromPoint(
                                    event.clientX,
                                    event.clientY,
                                  );
                                }
                              }}
                              style={{
                                gridColumn: dayIndex + 2,
                                gridRow: hourIndex + 1,
                              }}
                              type="button"
                            >
                              {isSelected ? (
                                <span
                                  className={cn(
                                    "absolute inset-x-1 -top-px bottom-0 z-20 bg-sky-600/85 shadow-sm",
                                    startsSelection && "rounded-t-md",
                                    endsSelection && "rounded-b-md",
                                  )}
                                >
                                  {startsSelection && selection ? (
                                    <span className="block px-2 py-1 text-xs font-medium text-white">
                                      {formatHour(selection.startHour)} -{" "}
                                      {formatHour(selection.endHour)}
                                    </span>
                                  ) : null}
                                </span>
                              ) : null}

                              {cell.isWorkingHour &&
                              cell.unavailableReason === "past" &&
                              !cell.myReservationStatus ? (
                                <span
                                  className="absolute inset-x-1 top-2 z-10 rounded-sm bg-muted px-1 py-1 text-center text-[11px] font-medium leading-4 text-muted-foreground"
                                >
                                  Past time
                                </span>
                              ) : null}

                              {!cell.isWorkingHour ? (
                                <span className="sr-only">Not working hour</span>
                              ) : null}
                            </button>
                          );
                        }),
                      )}

                      {weekDays.flatMap((day, dayIndex) =>
                        (fullCapacityBlocksByDate.get(day.dateParam) ?? []).map(
                          (block) => {
                            const startLine = block.startHour - firstHour + 1;
                            const endLine = block.endHour - firstHour + 1;

                            return (
                              <div
                                className="pointer-events-none z-10 p-1"
                                key={`${day.dateParam}-full-${block.startHour}`}
                                style={{
                                  gridColumn: dayIndex + 2,
                                  gridRow: `${startLine} / ${endLine}`,
                                }}
                              >
                                <FullCapacityBlockView />
                              </div>
                            );
                          },
                        ),
                      )}

                      {weekDays.flatMap((day, dayIndex) =>
                        (myReservationBlocksByDate.get(day.dateParam) ?? []).map(
                          (block) => {
                            const startLine = block.startHour - firstHour + 1;
                            const endLine = block.endHour - firstHour + 1;

                            return (
                              <div
                                className="pointer-events-none z-10 p-1"
                                key={`${day.dateParam}-${block.id}`}
                                style={{
                                  gridColumn: dayIndex + 2,
                                  gridRow: `${startLine} / ${endLine}`,
                                }}
                              >
                                <MyReservationBlockView block={block} />
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
        </div>

        {isReasonDialogOpen ? (
          <div
            aria-labelledby="reservation-reason-dialog-title"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
            role="dialog"
          >
            <button
              aria-label="Close request dialog"
              className="absolute inset-0 cursor-default"
              onClick={() => setIsReasonDialogOpen(false)}
              type="button"
            />
            <div className="relative z-10 grid w-full max-w-lg gap-5 rounded-lg border bg-background p-5 shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3
                    className="font-medium"
                    id="reservation-reason-dialog-title"
                  >
                    Complete reservation request
                  </h3>
                  {selection ? (
                    <p className="mt-1 text-sm text-muted-foreground" dir="rtl">
                      {weekDays[selection.dayIndex]?.modalDateLabel ??
                        selection.dateParam}
                      ، {formatPersianHour(selection.startHour)} تا{" "}
                      {formatPersianHour(selection.endHour)}
                    </p>
                  ) : null}
                </div>
                <button
                  aria-label="Close request dialog"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setIsReasonDialogOpen(false)}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>

              <label className="grid gap-2 text-sm font-medium">
                Reason
                <textarea
                  autoFocus
                  className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  maxLength={500}
                  name="reason"
                  placeholder="Optional"
                />
              </label>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
                  onClick={() => setIsReasonDialogOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <SubmitButton pendingLabel="Submitting...">
                  Submit request
                </SubmitButton>
              </div>
            </div>
          </div>
        ) : null}
      </form>
    </>
  );
}
