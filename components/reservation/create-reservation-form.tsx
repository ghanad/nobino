"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LunchActionState } from "@/app/lunch/actions";
import type { CreateReservationActionState } from "@/app/reservations/actions";
import {
  ActionResultBridge,
  ReservationsActionToast,
} from "@/components/reservation/create-reservation/action-feedback";
import {
  CalendarLegend,
  CapacityDots,
  PendingRequestsBadge,
} from "@/components/reservation/create-reservation/capacity-indicators";
import {
  buildDateHref,
  formatHour,
  formatPersianHourRangeAriaLabel,
  formatPersianHourRangeTooltip,
  formatPersianShortHourRange,
} from "@/components/reservation/create-reservation/formatters";
import { MobileDayView } from "@/components/reservation/create-reservation/mobile-day-view";
import { ReservationRequestDialog } from "@/components/reservation/create-reservation/reservation-request-dialog";
import {
  buildSelection,
  buildSlotAriaLabel,
  getCellState,
  getDefaultSelectedDayIndex,
  getHourRange,
  getSelectionLimitError,
  getSelectionRangeError,
  isSelectionEnd,
  isSelectionStart,
  selectionContainsHour,
} from "@/components/reservation/create-reservation/slot-helpers";
import { SlotDetailsPopover } from "@/components/reservation/create-reservation/slot-details-popover";
import type {
  ActionToast,
  CreateReservationFormProps,
  LunchPrompt,
  MobileSelectionHandle,
  Selection,
  SelectionSource,
} from "@/components/reservation/create-reservation/types";
import { formatJalaliDateParam } from "@/lib/jalali-date";
import { shouldOfferBreakfastForStart } from "@/lib/food-reservation-rules";
import { cn } from "@/lib/utils";

export type {
  CreateReservationFormProps,
  RequestableSlot,
  SlotReservationDetail,
  WeekDay,
} from "@/components/reservation/create-reservation/types";

const initialCreateReservationState: CreateReservationActionState = {
  message: "",
  status: "idle",
};

const initialLunchActionState: LunchActionState = {
  message: "",
  status: "idle",
};

export function CreateReservationForm({
  action,
  dailyActiveReservationCountByDate,
  dailyReservedHoursByDate,
  dailyUserHourLimit,
  emptyMessage,
  lunchAvailabilityByDate,
  buildings,
  lunchReservationAction,
  nextWeekDateParam,
  oneReservationPerDayEnabled,
  onFoodReservationChanged,
  onReservationCreated,
  previousWeekDateParam,
  resourcePools,
  todayDateParam,
  weekDays,
  weekLabel,
}: CreateReservationFormProps) {
  const defaultPool = resourcePools[0];
  const [state, formAction] = useActionState(
    action,
    initialCreateReservationState,
  );
  const [lunchState, lunchFormAction] = useActionState(
    lunchReservationAction,
    initialLunchActionState,
  );
  const [toast, setToast] = useState<ActionToast | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectionSource, setSelectionSource] = useState<SelectionSource | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [mobileDraggingHandle, setMobileDraggingHandle] =
    useState<MobileSelectionHandle | null>(null);
  const [isReasonDialogOpen, setIsReasonDialogOpen] = useState(false);
  const [partySize, setPartySize] = useState(1);
  const [lunchPrompt, setLunchPrompt] = useState<LunchPrompt | null>(null);
  const [selectedMobileDayIndex, setSelectedMobileDayIndex] = useState(() =>
    getDefaultSelectedDayIndex(weekDays, todayDateParam),
  );
  const selectionRef = useRef<Selection | null>(null);
  const hours = useMemo(() => getHourRange(weekDays), [weekDays]);
  const weekKey = weekDays.map((day) => day.dateParam).join("|");
  const defaultMobileDayIndex = useMemo(
    () => getDefaultSelectedDayIndex(weekDays, todayDateParam),
    [todayDateParam, weekDays],
  );
  const isCurrentWeek = useMemo(
    () => weekDays.some((day) => day.dateParam === todayDateParam),
    [todayDateParam, weekDays],
  );
  const selectedMobileDay =
    weekDays[selectedMobileDayIndex] ?? weekDays[0] ?? null;
  const selectedHours = selection ? selection.endHour - selection.startHour : 0;
  const reservedHoursForSelectedDay = selection
    ? dailyReservedHoursByDate[selection.dateParam] ?? 0
    : 0;
  const selectedDailyTotal = reservedHoursForSelectedDay + selectedHours;
  const selectionRangeError =
    selectionSource === "mobile"
      ? getSelectionRangeError(weekDays, selection)
      : null;
  const isSelectionOverDailyLimit =
    Boolean(selection) && selectedDailyTotal > dailyUserHourLimit;
  const hasActiveReservationForSelectedDay =
    selection
      ? oneReservationPerDayEnabled &&
        (dailyActiveReservationCountByDate[selection.dateParam] ?? 0) > 0
      : false;
  const isSelectionBlocked =
    Boolean(selectionRangeError) ||
    isSelectionOverDailyLimit ||
    hasActiveReservationForSelectedDay;
  const selectionLimitError = getSelectionLimitError({
    dailyUserHourLimit,
    hasActiveReservationForSelectedDay,
    isSelectionOverDailyLimit,
    reservedHoursForSelectedDay,
  });
  const selectionError = selectionRangeError ?? selectionLimitError;
  const selectedLunchDateParam = lunchPrompt?.dateParam ?? selection?.dateParam;
  const lunchAvailability = selectedLunchDateParam
    ? lunchAvailabilityByDate[selectedLunchDateParam] ?? null
    : null;
  const canSubmitLunchReservation = Boolean(
    lunchAvailability?.isOpen && buildings.length > 0,
  );
  const dismissToast = useCallback(() => setToast(null), []);

  const clearSelection = useCallback(() => {
    selectionRef.current = null;
    setSelection(null);
    setSelectionSource(null);
    setMobileDraggingHandle(null);
    setIsReasonDialogOpen(false);
    setPartySize(1);
    setLunchPrompt(null);
  }, []);

  useEffect(() => {
    selectionRef.current = null;
    setSelection(null);
    setSelectionSource(null);
    setIsDragging(false);
    setMobileDraggingHandle(null);
    setIsReasonDialogOpen(false);
    setPartySize(1);
    setLunchPrompt(null);
    setSelectedMobileDayIndex(defaultMobileDayIndex);
  }, [defaultMobileDayIndex, weekKey]);

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
    setSelectionSource("desktop");
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
    if (!isDragging) {
      return;
    }

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

  const handleActionComplete = useCallback(
    (nextState: CreateReservationActionState) => {
      if (nextState.status === "error") {
        setToast({
          id: Date.now(),
          message: nextState.message,
          variant: "error",
        });
        return;
      }

      if (nextState.status === "success" && nextState.mutation) {
        const mutation = nextState.mutation;

        onReservationCreated?.(mutation);

        const reservationStartAt = new Date(mutation.startAt);
        const reservationDateParam = formatJalaliDateParam(reservationStartAt);
        const promptAvailability =
          lunchAvailabilityByDate[reservationDateParam] ?? null;
        const reservationDay = weekDays.find(
          (day) => day.dateParam === reservationDateParam,
        );

        if (promptAvailability?.isOpen) {
          const sourcePool = resourcePools.find(
            (pool) => pool.id === mutation.resourcePoolId,
          );

          if (!sourcePool) {
            setToast({
              id: Date.now(),
              message: nextState.message,
              variant: "success",
            });
            clearSelection();
            return;
          }

          setToast(null);
          setLunchPrompt({
            canOfferBreakfast: shouldOfferBreakfastForStart(reservationStartAt),
            dateLabel: reservationDay?.modalDateLabel ?? reservationDateParam,
            dateParam: reservationDateParam,
            partySize: mutation.partySize,
            sourceReservationId: mutation.reservationId,
            sourceBuildingId: sourcePool.building.id,
            sourceBuildingName: sourcePool.building.name,
          });
          setIsReasonDialogOpen(true);
          return;
        }

        setToast({
          id: Date.now(),
          message: nextState.message,
          variant: "success",
        });
        clearSelection();
      }
    },
    [
      clearSelection,
      lunchAvailabilityByDate,
      onReservationCreated,
      resourcePools,
      weekDays,
    ],
  );

  const handleLunchActionComplete = useCallback(
    (nextState: LunchActionState) => {
      setToast({
        id: Date.now(),
        message: nextState.message,
        variant: nextState.status === "error" ? "error" : "success",
      });

      if (nextState.status === "success") {
        if (nextState.mutation) {
          onFoodReservationChanged?.(nextState.mutation);
        }
        clearSelection();
      }
    },
    [clearSelection, onFoodReservationChanged],
  );

  function selectMobileSingleHour(dayIndex: number, hour: number) {
    const nextSelection = buildSelection(weekDays, dayIndex, hour, hour);

    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setSelectionSource("mobile");
    setIsReasonDialogOpen(false);
  }

  function openReasonDialogForSelection() {
    if (!selection || isSelectionBlocked) {
      return;
    }

    setIsReasonDialogOpen(true);
  }

  function updateMobileSelectionFromHour(
    handle: MobileSelectionHandle,
    hour: number,
  ) {
    setSelection((current) => {
      if (!current) {
        return current;
      }

      const day = weekDays[current.dayIndex];

      if (!day) {
        return current;
      }

      const slotHours = day.slots.map((slot) => slot.slotStartHour);

      if (!slotHours.includes(hour)) {
        return current;
      }

      const nextSelection =
        handle === "start"
          ? {
              ...current,
              anchorHour: Math.min(hour, current.endHour - 1),
              startHour: Math.min(hour, current.endHour - 1),
            }
          : {
              ...current,
              endHour: Math.max(hour + 1, current.startHour + 1),
            };

      selectionRef.current = nextSelection;
      setSelectionSource("mobile");
      return nextSelection;
    });
  }

  function updateMobileSelectionFromPoint(
    handle: MobileSelectionHandle,
    clientX: number,
    clientY: number,
  ) {
    const element = document.elementFromPoint(clientX, clientY);
    const slot = element?.closest<HTMLElement>("[data-mobile-calendar-slot='true']");

    if (!slot) {
      return;
    }

    const hour = Number(slot.dataset.hour);

    if (Number.isNaN(hour)) {
      return;
    }

    updateMobileSelectionFromHour(handle, hour);
  }

  return (
    <>
      <ReservationsActionToast onDismiss={dismissToast} toast={toast} />
      <form action={formAction} className="grid gap-5 rounded-lg border bg-card p-5">
        <ActionResultBridge onComplete={handleActionComplete} state={state} />
        <ActionResultBridge
          onComplete={handleLunchActionComplete}
          state={lunchState}
        />

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
                onClick={clearSelection}
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
                    className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md bg-sky-50 px-3 text-xs font-medium text-sky-900 transition-colors hover:bg-sky-100 hover:text-sky-950"
                    href={buildDateHref(todayDateParam)}
                    onClick={() => {
                      setSelectedMobileDayIndex(defaultMobileDayIndex);
                      clearSelection();
                    }}
                  >
                    بازگشت به هفته جاری
                  </Link>
                ) : null}
              </div>
              <Link
                className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
                href={buildDateHref(nextWeekDateParam)}
                onClick={clearSelection}
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
                onClick={clearSelection}
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span dir="rtl">هفته قبل</span>
              </Link>
              <Link
                className="inline-flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-md border bg-muted/60 px-2 text-sm font-medium hover:bg-accent"
                href={buildDateHref(todayDateParam)}
                onClick={() => {
                  setSelectedMobileDayIndex(defaultMobileDayIndex);
                  clearSelection();
                }}
              >
                امروز
              </Link>
              <Link
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent"
                href={buildDateHref(nextWeekDateParam)}
                onClick={clearSelection}
              >
                <span dir="rtl">هفته بعد</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
              </Link>
            </div>
          </div>

          <CalendarLegend />
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
            <>
              <MobileDayView
                clearSelection={clearSelection}
                mobileDraggingHandle={mobileDraggingHandle}
                onDaySelect={(dayIndex) => {
                  setSelectedMobileDayIndex(dayIndex);
                  clearSelection();
                }}
                onOpenReasonDialog={openReasonDialogForSelection}
                onSelectSingleHour={selectMobileSingleHour}
                selectedHours={selectedHours}
                selectedMobileDay={selectedMobileDay}
                selectedMobileDayIndex={selectedMobileDayIndex}
                selection={selection}
                selectionError={selectionError}
                setMobileDraggingHandle={setMobileDraggingHandle}
                todayDateParam={todayDateParam}
                updateMobileSelectionFromPoint={updateMobileSelectionFromPoint}
                weekDays={weekDays}
              />

              <div
                className="hidden overflow-hidden rounded-lg border border-slate-200 bg-background shadow-sm md:block"
                dir="ltr"
                onPointerLeave={() => setIsDragging(false)}
                onPointerUp={finishSelection}
              >
                <div className="overflow-x-auto">
                  <div className="min-w-[920px]">
                    <div className="grid grid-cols-[56px_repeat(7,minmax(116px,1fr))] border-b border-slate-100 bg-slate-50/70">
                      <div className="border-r border-slate-100 px-2 py-3 text-center text-xs font-medium text-muted-foreground">
                        ساعت
                      </div>
                      {weekDays.map((day) => (
                        <div
                          className={cn(
                            "border-r border-slate-100 px-3 py-3 text-center text-sm font-semibold last:border-r-0",
                            day.closedReason && "bg-slate-100/80 text-slate-500",
                          )}
                          key={day.dateParam}
                          title={
                            day.closedReason
                              ? `${day.dateLabel}، ${day.closedReason}، این روز قابل رزرو نیست`
                              : day.dateLabel
                          }
                          dir="rtl"
                        >
                          <span>{day.shortLabel}</span>
                          {day.closedReason ? (
                            <span className="mt-1 line-clamp-2 text-xs font-medium leading-4 text-red-600">
                              {day.closedReason}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className="max-h-[460px] overflow-y-auto">
                      <div
                        className="grid touch-none select-none grid-cols-[56px_repeat(7,minmax(116px,1fr))]"
                        style={{
                          gridTemplateRows: `repeat(${hours.length}, 3.25rem)`,
                        }}
                      >
                        {hours.map((hour, hourIndex) => {
                          const timeLabel = formatPersianShortHourRange(
                            hour,
                            hour + 1,
                          );
                          const timeTooltip = formatPersianHourRangeTooltip(
                            hour,
                            hour + 1,
                          );
                          const timeAriaLabel = formatPersianHourRangeAriaLabel(
                            hour,
                            hour + 1,
                          );

                          return (
                            <div
                              className="relative border-b border-r border-slate-100 bg-slate-50/40"
                              key={`time-${hour}`}
                              style={{ gridColumn: 1, gridRow: hourIndex + 1 }}
                            >
                              <span
                                aria-label={timeAriaLabel}
                                className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs font-medium text-muted-foreground [unicode-bidi:isolate]"
                                dir="ltr"
                                title={timeTooltip}
                              >
                                {timeLabel}
                              </span>
                            </div>
                          );
                        })}

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
                            const slotLabel = buildSlotAriaLabel(day, hour, cell);

                            return (
                              <SlotDetailsPopover
                                cell={cell}
                                className={cn(
                                  "border-b border-r border-slate-100 bg-background",
                                  day.closedReason && "bg-slate-50/80",
                                  dayIndex === weekDays.length - 1 && "border-r-0",
                                )}
                                isDragging={isDragging}
                                key={`${day.dateParam}-${hour}`}
                                style={{
                                  gridColumn: dayIndex + 2,
                                  gridRow: hourIndex + 1,
                                }}
                              >
                                <div
                                  aria-disabled={!cell.isRequestable}
                                  aria-label={slotLabel}
                                  aria-pressed={isSelected}
                                  className={cn(
                                    "relative h-full w-full bg-background p-0 text-left transition-colors focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    !cell.isRequestable && "cursor-not-allowed",
                                    cell.isRequestable && "cursor-pointer",
                                    day.closedReason &&
                                      "cursor-not-allowed bg-slate-50/80 text-slate-400",
                                    !cell.isWorkingHour &&
                                      "cursor-not-allowed bg-slate-50 text-slate-400",
                                    cell.isWorkingHour &&
                                      cell.availableCount <= 0 &&
                                      cell.unavailableReason !== "past" &&
                                      "cursor-not-allowed bg-slate-50 text-slate-500",
                                    cell.isWorkingHour &&
                                      cell.unavailableReason === "past" &&
                                      "cursor-not-allowed bg-slate-100/70 text-slate-400",
                                    cell.isWorkingHour &&
                                      (cell.myReservationStatus === "PENDING" ||
                                        cell.myReservationStatus ===
                                          "ALTERNATIVE_PROPOSED") &&
                                      "bg-amber-50/70 text-amber-900 ring-1 ring-inset ring-amber-200",
                                    cell.isWorkingHour &&
                                      cell.myReservationStatus === "APPROVED" &&
                                      "bg-sky-50/70 text-sky-900 ring-1 ring-inset ring-sky-200",
                                    cell.isRequestable && "hover:bg-sky-50/50",
                                  )}
                                  data-calendar-cell="true"
                                  data-day-index={dayIndex}
                                  data-hour={hour}
                                  onKeyDown={(event) => {
                                    if (
                                      event.key !== "Enter" &&
                                      event.key !== " "
                                    ) {
                                      return;
                                    }

                                    event.preventDefault();

                                    if (!cell.isRequestable) {
                                      return;
                                    }

                                    const nextSelection = buildSelection(
                                      weekDays,
                                      dayIndex,
                                      hour,
                                      hour,
                                    );
                                    selectionRef.current = nextSelection;
                                    setSelection(nextSelection);
                                    setSelectionSource("desktop");
                                    setIsReasonDialogOpen(true);
                                  }}
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
                                  role="button"
                                  tabIndex={0}
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
                                  !day.closedReason &&
                                  cell.unavailableReason !== "past" ? (
                                    <>
                                      <CapacityDots cell={cell} />
                                      <PendingRequestsBadge
                                        className="absolute right-2 top-1.5 z-10"
                                        count={cell.pendingCount}
                                      />
                                    </>
                                  ) : null}

                                  {!cell.isWorkingHour ? (
                                    <span className="sr-only">روز غیرکاری</span>
                                  ) : null}
                                </div>
                              </SlotDetailsPopover>
                            );
                          }),
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <ReservationRequestDialog
          canSubmitLunchReservation={canSubmitLunchReservation}
          clearSelection={clearSelection}
          dailyUserHourLimit={dailyUserHourLimit}
          hasActiveReservationForSelectedDay={hasActiveReservationForSelectedDay}
          isOpen={isReasonDialogOpen}
          isSelectionBlocked={isSelectionBlocked}
          isSelectionOverDailyLimit={isSelectionOverDailyLimit}
          lunchAvailability={lunchAvailability}
          lunchFormAction={lunchFormAction}
          lunchPrompt={lunchPrompt}
          partySize={partySize}
          reservedHoursForSelectedDay={reservedHoursForSelectedDay}
          selectedDailyTotal={selectedDailyTotal}
          selection={selection}
          setIsReasonDialogOpen={setIsReasonDialogOpen}
          setPartySize={setPartySize}
          weekDays={weekDays}
        />
      </form>
    </>
  );
}
