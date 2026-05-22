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
  unavailableReason: "full" | "past" | null;
};

type WeekDay = {
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
  unavailableReason: "full" | "past" | null;
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
      unavailableReason: null,
    };
  }

  return {
    isRequestable: slot.isRequestable,
    isWorkingHour: true,
    unavailableReason: slot.unavailableReason,
  };
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
                White slots are requestable. Past and full slots are blocked.
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
                        {day.shortLabel}
                      </div>
                    ))}
                  </div>

                  <div className="max-h-[460px] overflow-y-auto">
                    <div className="touch-none select-none">
                      {hours.map((hour) => (
                        <div
                          className="grid h-12 grid-cols-[72px_repeat(7,minmax(116px,1fr))] border-b last:border-b-0"
                          key={hour}
                        >
                          <div className="relative border-r bg-background">
                            <span className="absolute right-3 top-1 text-xs font-medium text-muted-foreground">
                              {formatHour(hour)}
                            </span>
                          </div>
                          {weekDays.map((day, dayIndex) => {
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

                            return (
                              <button
                                aria-label={`${day.dateLabel} ${formatHour(hour)}`}
                                aria-pressed={isSelected}
                                className={cn(
                                  "relative border-r bg-background p-0 text-left last:border-r-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  !cell.isWorkingHour &&
                                    "cursor-not-allowed bg-muted/30",
                                  cell.isWorkingHour &&
                                    cell.unavailableReason === "full" &&
                                    "cursor-not-allowed bg-red-50/80 text-red-800",
                                  cell.isWorkingHour &&
                                    cell.unavailableReason === "past" &&
                                    "cursor-not-allowed bg-muted/50 text-muted-foreground",
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
                                type="button"
                              >
                                {isSelected ? (
                                  <span
                                    className={cn(
                                      "absolute inset-x-1 -top-px bottom-0 z-10 bg-sky-600/85 shadow-sm",
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

                                {cell.isWorkingHour && cell.unavailableReason ? (
                                  <span
                                    className={cn(
                                      "absolute inset-x-1 top-2 z-10 rounded-sm px-1 py-1 text-center text-[11px] font-medium leading-4",
                                      cell.unavailableReason === "full"
                                        ? "bg-red-100 text-red-800"
                                        : "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {cell.unavailableReason === "full"
                                      ? "No system available"
                                      : "Past time"}
                                  </span>
                                ) : null}

                                {!cell.isWorkingHour ? (
                                  <span className="sr-only">Not working hour</span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      ))}
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
