"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react";

import { proposeAlternativeDropAction } from "@/app/manager/actions";
import { CalendarLegend } from "@/components/calendar/manager-weekly-calendar/calendar-legend";
import {
  getCellTone,
  getDefaultSelectedDayIndex,
  getHourRange,
  getSlotForHour,
} from "@/components/calendar/manager-weekly-calendar/calendar-helpers";
import {
  buildCapacityDots,
  CapacityDot,
  CapacityDots,
} from "@/components/calendar/manager-weekly-calendar/capacity-dots";
import {
  buildDateHref,
  formatPersianNumber,
  formatPersianShortHourRange,
} from "@/components/calendar/manager-weekly-calendar/formatting";
import { MobileReservationBlock } from "@/components/calendar/manager-weekly-calendar/mobile-reservation-block";
import {
  buildMobileSlotAriaLabel,
  getMobileSlotStatusLabel,
  getMobileSlotToneClass,
} from "@/components/calendar/manager-weekly-calendar/mobile-slot-helpers";
import { PendingRequestsBadge } from "@/components/calendar/manager-weekly-calendar/pending-requests-badge";
import { ReservationBlock } from "@/components/calendar/manager-weekly-calendar/reservation-block";
import {
  canUpdateReservationTime,
  getPositionedReservationBlocks,
} from "@/components/calendar/manager-weekly-calendar/reservation-block-helpers";
import type {
  DraggedReservation,
  ManagerWeekDay,
  ManagerWeeklyCalendarProps,
  ManagerWeekSlot,
  ResizingReservation,
  SlotPointerTarget,
} from "@/components/calendar/manager-weekly-calendar/types";
import { cn } from "@/lib/utils";

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

export function ManagerWeeklyCalendar({
  currentDateParam,
  emptyMessage,
  nextWeekDateParam,
  previousWeekDateParam,
  todayDateParam,
  weekDays,
  weekLabel,
}: ManagerWeeklyCalendarProps) {
  const [draggedReservation, setDraggedReservation] =
    useState<DraggedReservation | null>(null);
  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [localWeekDays, setLocalWeekDays] = useState(weekDays);
  const mobileDayTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileDayTabsContainerRef = useRef<HTMLDivElement | null>(null);
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
  const isCurrentWeek = weekDays.some((day) => day.dateParam === todayDateParam);
  const mobileDayKey = localWeekDays.map((day) => day.dateParam).join("|");
  const defaultMobileDayIndex = getDefaultSelectedDayIndex(
    localWeekDays,
    currentDateParam,
  );
  const [selectedMobileDayIndex, setSelectedMobileDayIndex] = useState(
    defaultMobileDayIndex,
  );
  const selectedMobileDay =
    localWeekDays[selectedMobileDayIndex] ?? localWeekDays[0] ?? null;

  useEffect(() => {
    setLocalWeekDays(weekDays);
  }, [weekDays]);

  useEffect(() => {
    setSelectedMobileDayIndex(
      getDefaultSelectedDayIndex(weekDays, currentDateParam),
    );
  }, [currentDateParam, weekDays]);

  useEffect(() => {
    const container = mobileDayTabsContainerRef.current;
    const selectedTab = mobileDayTabRefs.current[selectedMobileDayIndex];

    if (!container || !selectedTab) {
      return;
    }

    const nextScrollLeft =
      selectedTab.offsetLeft -
      (container.clientWidth - selectedTab.offsetWidth) / 2;

    container.scrollTo({
      left: Math.max(nextScrollLeft, 0),
      behavior: "auto",
    });
  }, [mobileDayKey, selectedMobileDayIndex]);

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
        !canUpdateReservationTime(dragged.status)
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
        !canUpdateReservationTime(resizing.status)
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
        setDropError("مدت رزرو باید حداقل ۱ ساعت باشد.");
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
        <div
          className="grid gap-3 rounded-md border bg-muted/30 p-3"
          dir="rtl"
        >
          <div
            className="hidden grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:grid"
            dir="ltr"
          >
            <Link
              className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
              href={buildDateHref(previousWeekDateParam)}
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span dir="rtl">هفته قبل</span>
            </Link>
            <div
              className={cn(
                "h-16 text-center",
                isCurrentWeek
                  ? "flex items-center justify-center"
                  : "grid content-center justify-items-center gap-2",
              )}
              dir="rtl"
            >
              <p className="text-sm font-medium">{weekLabel}</p>
              {!isCurrentWeek ? (
                <Link
                  className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md bg-sky-50 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-sky-100 hover:text-slate-800"
                  href={buildDateHref(todayDateParam)}
                >
                  بازگشت به هفته جاری
                </Link>
              ) : null}
            </div>
            <Link
              className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
              href={buildDateHref(nextWeekDateParam)}
            >
              <span dir="rtl">هفته بعد</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
            </Link>
          </div>

          <div className="text-center sm:hidden">
            <p className="text-sm font-medium">{weekLabel}</p>
          </div>
          <div className="flex items-center gap-2 sm:hidden" dir="ltr">
            <Link
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent"
              href={buildDateHref(previousWeekDateParam)}
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span dir="rtl">هفته قبل</span>
            </Link>
            <Link
              className="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-md border bg-muted/60 px-2 text-sm font-medium hover:bg-accent"
              href={buildDateHref(todayDateParam)}
            >
              امروز
            </Link>
            <Link
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent"
              href={buildDateHref(nextWeekDateParam)}
            >
              <span dir="rtl">هفته بعد</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
            </Link>
          </div>
        </div>

        <CalendarLegend />
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
        <>
          <div className="mt-5 grid gap-3 sm:hidden" dir="rtl">
            <div
              aria-label="انتخاب روز هفته"
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              dir="ltr"
              ref={mobileDayTabsContainerRef}
              role="tablist"
            >
              {localWeekDays.map((day, dayIndex) => {
                const isSelected = dayIndex === selectedMobileDayIndex;
                const isToday = day.dateParam === todayDateParam;

                return (
                  <button
                    aria-current={isToday ? "date" : undefined}
                    aria-selected={isSelected}
                    className={cn(
                      "inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-md border bg-background px-3 text-sm font-medium text-slate-700 transition-colors",
                      isSelected &&
                        "border-primary bg-primary text-primary-foreground",
                      !isSelected && "hover:bg-accent",
                      day.closedReason && !isSelected && "text-slate-500",
                    )}
                    dir="rtl"
                    key={day.dateParam}
                    onClick={() => setSelectedMobileDayIndex(dayIndex)}
                    ref={(element) => {
                      mobileDayTabRefs.current[dayIndex] = element;
                    }}
                    role="tab"
                    type="button"
                  >
                    <span>{day.shortLabel}</span>
                    {isToday ? (
                      <span
                        className={cn(
                          "rounded-sm px-1 py-0.5 text-[10px] font-semibold",
                          isSelected
                            ? "bg-primary-foreground/15 text-primary-foreground"
                            : "bg-sky-50 text-sky-700",
                        )}
                      >
                        امروز
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {selectedMobileDay ? (
              <div className="grid gap-3">
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-right">
                  <h3 className="text-sm font-semibold">
                    {selectedMobileDay.dateLabel}
                  </h3>
                  {selectedMobileDay.closedReason ? (
                    <p className="mt-1 text-xs text-red-700">
                      {selectedMobileDay.closedReason}
                    </p>
                  ) : null}
                </div>

                {selectedMobileDay.slots.length === 0 ? (
                  <p className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
                    برای این روز بازه ساعت کاری وجود ندارد.
                  </p>
                ) : (
                  <div
                    className="grid overflow-hidden rounded-lg border border-slate-200 bg-background shadow-sm"
                    dir="ltr"
                    style={{
                      gridTemplateColumns: "72px minmax(0,1fr)",
                      gridTemplateRows: `repeat(${selectedMobileDay.slots.length}, minmax(72px, auto))`,
                    }}
                  >
                    {selectedMobileDay.slots.map((slot, slotIndex) => {
                      const timeLabel = formatPersianShortHourRange(
                        slot.slotStartHour,
                        slot.slotEndHour,
                      );

                      return (
                        <div
                          className="flex items-center justify-center border-b border-r border-slate-100 bg-slate-50/60 px-2 py-2 text-sm font-semibold text-slate-700 last:border-b-0"
                          key={`mobile-time-${selectedMobileDay.dateParam}-${slot.slotStartHour}`}
                          style={{
                            gridColumn: 1,
                            gridRow: slotIndex + 1,
                          }}
                        >
                          <span className="[unicode-bidi:isolate]" dir="ltr">
                            {timeLabel}
                          </span>
                        </div>
                      );
                    })}

                    {selectedMobileDay.slots.map((slot, slotIndex) => (
                      <div
                        aria-label={buildMobileSlotAriaLabel(
                          selectedMobileDay,
                          slot,
                        )}
                        className={cn(
                          "relative flex min-h-[72px] items-center justify-between gap-3 border-b px-3 py-2 text-right last:border-b-0",
                          getMobileSlotToneClass(slot),
                          resizeOverSlotKey ===
                            `${selectedMobileDay.dateParam}-${slot.slotStartHour}-start` ||
                            resizeOverSlotKey ===
                              `${selectedMobileDay.dateParam}-${slot.slotStartHour}-end`
                            ? "outline outline-2 outline-amber-600 outline-offset-[-2px]"
                            : null,
                        )}
                        data-date-param={selectedMobileDay.dateParam}
                        data-manager-calendar-cell="true"
                        data-slot-end-hour={slot.slotEndHour}
                        data-slot-start-hour={slot.slotStartHour}
                        dir="rtl"
                        key={`mobile-slot-${selectedMobileDay.dateParam}-${slot.slotStartHour}`}
                        style={{
                          gridColumn: 2,
                          gridRow: slotIndex + 1,
                        }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="flex max-w-28 flex-wrap justify-end gap-1"
                          >
                            {buildCapacityDots(slot).map((tone, index) => (
                              <CapacityDot key={`${tone}-${index}`} tone={tone} />
                            ))}
                          </span>
                          <PendingRequestsBadge count={slot.pendingCount} />
                        </div>
                        <span className="text-xs font-medium text-slate-600">
                          {getMobileSlotStatusLabel(slot)}
                        </span>
                      </div>
                    ))}

                    {getPositionedReservationBlocks(selectedMobileDay).map(
                      (block) => {
                        const startIndex = selectedMobileDay.slots.findIndex(
                          (slot) => slot.slotStartHour === block.startHour,
                        );
                        const endIndexExclusive = selectedMobileDay.slots.findIndex(
                          (slot) => slot.slotStartHour >= block.endHour,
                        );
                        const endLine =
                          endIndexExclusive >= 0
                            ? endIndexExclusive + 1
                            : selectedMobileDay.slots.length + 1;

                        if (startIndex < 0 || endLine <= startIndex + 1) {
                          return null;
                        }

                        return (
                          <div
                            className="pointer-events-none z-10 p-2"
                            key={`mobile-block-${selectedMobileDay.dateParam}-${block.detail.id}`}
                            style={{
                              gridColumn: 2,
                              gridRow: `${startIndex + 1} / ${endLine}`,
                            }}
                          >
                            <MobileReservationBlock
                              block={block}
                              isResizing={
                                resizingReservation?.reservationId ===
                                block.detail.id
                              }
                              onResizeStart={(event, resizeBlock, edge) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setDropError(null);
                                setDraggedReservation(null);
                                setDragOverSlotKey(null);
                                setResizingReservation({
                                  dateParam: selectedMobileDay.dateParam,
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
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div
            className="mt-5 hidden overflow-hidden rounded-lg border bg-background shadow-sm sm:block"
            dir="ltr"
          >
            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
                <div>
                  <div className="sticky top-0 z-20 grid grid-cols-[64px_repeat(7,minmax(124px,1fr))] border-b bg-slate-50/80">
                    <div className="border-r px-3 py-3 text-center text-sm font-semibold text-slate-500" dir="rtl">
                      ساعت
                    </div>
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
                    className="grid grid-cols-[64px_repeat(7,minmax(124px,1fr))]"
                    style={{
                      gridTemplateRows: `repeat(${hours.length}, minmax(5.75rem, auto))`,
                    }}
                  >
                    {hours.map((hour, hourIndex) => (
                      <div
                        className="relative border-b border-r bg-slate-50/80"
                        key={`time-${hour}`}
                        style={{ gridColumn: 1, gridRow: hourIndex + 1 }}
                      >
                        <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 text-center text-xs font-medium text-slate-500" dir="ltr">
                          {formatPersianShortHourRange(hour, hour + 1)}
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
                              "relative border-b border-r text-left transition-colors",
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
                              <>
                                <CapacityDots slot={slot} />
                                <PendingRequestsBadge
                                  className="absolute left-2 top-2 z-10"
                                  count={slot.pendingCount}
                                />
                                <span className="sr-only">
                                  {`ظرفیت آزاد ${formatPersianNumber(
                                    available,
                                  )} از ${formatPersianNumber(slot.capacity)}، ${formatPersianNumber(
                                    slot.approvedCount,
                                  )} رزرو تاییدشده، ${formatPersianNumber(
                                    slot.pendingCount,
                                  )} درخواست در انتظار`}
                                </span>
                              </>
                            ) : (
                              <span className="sr-only">ساعت غیرکاری</span>
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
        </>
      )}
    </section>
  );
}
